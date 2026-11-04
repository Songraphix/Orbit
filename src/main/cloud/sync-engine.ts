import type { Database } from '../persistence/db';
import { transaction } from '../persistence/db';
import type { SyncStatus } from '@shared/types/account';
import { CloudError, isTransient, OfflineError } from './http';
import { isConflict } from './firestore-api';
import type { FetchedRecord, FirestoreApi, Write } from './firestore-api';
import {
  APPLY_ORDER,
  deleteRecord,
  readRecord,
  recordIds,
  writeCopy,
  writeRecord,
} from './sync-tables';
import {
  backoffMs,
  docIdFor,
  hashBody,
  MAX_PIECES,
  parseDocId,
  readyToSend,
  RECORD_VERSION,
  resolveConflict,
  splitBody,
} from './sync-model';
import type { Payload, SyncKind } from './sync-model';

export type SyncEngineDeps = {
  db: Database;
  api: FirestoreApi;
  uid: string;
  /** A valid ID token (refreshed as needed). Throws CloudError if the session is gone. */
  token: () => Promise<string>;
  deviceId: string;
  /** The cloud said no: refresh the session and say why ('verify-email', or retry). */
  onPermissionDenied: () => Promise<'verify-email' | 'retry'>;
  onStatus: (status: SyncStatus) => void;
  /** Cloud changes were written here: these kinds changed; these records went. */
  onApplied: (
    kinds: ReadonlySet<SyncKind>,
    removed: readonly { kind: SyncKind; id: string }[],
  ) => void;
  now?: () => number;
  random?: () => number;
  /** How often the queue is looked at (a local query — no network unless there's work). */
  tickMs?: number;
};

type Outbox = { kind: SyncKind; record_id: string; changed_at: number; attempts: number };
type Known = {
  update_time: string;
  hash: string;
  base: string | null;
  parts: number;
  deleted: number;
};

const PAGE = 300;
/** Writes per commit (Firestore allows 500; parts count too). */
const BATCH_WRITES = 400;
/** Look for other Macs' changes at most this often when Orbit comes to the front. */
const PULL_EVERY_MS = 2 * 60_000;

/**
 * Cloud sync for one signed-in account (docs/FIREBASE.md). Local-first: Orbit's own tables are
 * the truth here; triggers queue every change (sync_outbox, on disk) and this sends them —
 * after a quiet moment, in batches, only if they changed since last sent — and brings in what
 * other Macs changed since it last looked. Retries back off with jitter; a record changed on
 * both sides is reconciled (sync-model.resolveConflict), never silently dropped.
 */
export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private lastPullAt = 0;
  private status: SyncStatus;
  private readonly now: () => number;

  constructor(private readonly deps: SyncEngineDeps) {
    this.now = deps.now ?? Date.now;
    this.status = {
      state: 'syncing',
      pending: this.pendingCount(),
      lastSyncedAt: this.lastSynced(),
      error: null,
      conflicts: Number(this.getState('conflicts') ?? 0),
    };
  }

  /** Begins: a first sign-in here offers everything on this Mac to the account, once. */
  start(): void {
    const merged = `merged:${this.deps.uid}`;
    if (!this.getState(merged)) {
      this.enqueueAll();
      this.setState(merged, String(this.now()));
    }
    this.timer = setInterval(() => void this.tick(), this.deps.tickMs ?? 2_000);
    void this.syncNow();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get current(): SyncStatus {
    return this.status;
  }

  /** Pull, then push everything due (retries included). Concurrent calls share one run. */
  syncNow(): Promise<void> {
    if (this.running) return this.running;
    this.deps.db.prepare('UPDATE sync_outbox SET next_at = 0').run();
    return this.run(true);
  }

  /** Orbit came to the front: look for other Macs' changes if it's been a while. */
  pullSoon(): void {
    if (this.now() - this.lastPullAt >= PULL_EVERY_MS) void this.run(true);
  }

  /** Clears the "kept both versions" count once it's been seen. */
  clearConflicts(): void {
    this.setState('conflicts', '0');
    this.emit({ conflicts: 0 });
  }

  /** The timer: send queued changes when they're due (a local query; no network otherwise). */
  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    const due = this.dueRows();
    this.emit({ pending: this.pendingCount() });
    if (
      due.length &&
      readyToSend(
        due.map((r) => r.changed_at),
        this.now(),
      )
    ) {
      await this.run(false);
    }
  }

  private run(pull: boolean): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      this.emit({ state: 'syncing' });
      try {
        await this.ensureUserDoc();
        if (pull) await this.pull();
        await this.push();
        this.setState('last-synced', String(this.now()));
        this.emit({
          state: this.hasParked() ? 'error' : 'synced',
          error: this.hasParked() ? this.parkedMessage() : null,
          lastSyncedAt: this.now(),
        });
      } catch (error) {
        await this.fail(error);
      } finally {
        this.running = null;
        this.emit({ pending: this.pendingCount() });
      }
    })();
    return this.running;
  }

  private async fail(error: unknown): Promise<void> {
    if (error instanceof OfflineError) {
      this.emit({ state: 'offline', error: null });
    } else if (error instanceof CloudError && error.code === 'PERMISSION_DENIED') {
      const why = await this.deps.onPermissionDenied().catch(() => 'retry' as const);
      this.emit(
        why === 'verify-email'
          ? { state: 'verify-email', error: null }
          : { state: 'error', error: 'Orbit’s cloud refused the change. It will try again.' },
      );
    } else if (isTransient(error)) {
      this.emit({ state: 'error', error: 'Orbit’s cloud is busy right now. It will try again.' });
    } else {
      this.emit({
        state: 'error',
        error: error instanceof Error ? error.message : 'Sync failed.',
      });
    }
  }

  // ── Sending ─────────────────────────────────────────────────────────────────

  private async push(): Promise<void> {
    for (;;) {
      if (this.stopped) return;
      const rows = this.dueRows(BATCH_WRITES);
      if (rows.length === 0) return;
      const planned = rows.map((row) => this.plan(row)).filter((p) => p !== null);
      const writes: { row: Outbox; writes: Write[]; sent: Sent }[] = [];
      let count = 0;
      for (const p of planned) {
        if (count + p.writes.length > BATCH_WRITES && writes.length) break;
        writes.push(p);
        count += p.writes.length;
      }
      if (writes.length === 0) continue; // everything was unchanged and dropped
      await this.commitBatch(writes);
    }
  }

  /** What one queued record needs written — or null (unchanged, or nothing to delete). */
  private plan(row: Outbox): { row: Outbox; writes: Write[]; sent: Sent } | null {
    const { db } = this.deps;
    const known = this.known(row.kind, row.record_id);
    const payload = readRecord(db, row.kind, row.record_id);
    const docId = docIdFor(row.kind, row.record_id);
    const drop = () => {
      db.prepare('DELETE FROM sync_outbox WHERE kind = ? AND record_id = ? AND changed_at = ?').run(
        row.kind,
        row.record_id,
        row.changed_at,
      );
      return null;
    };
    if (payload === null) {
      if (!known || known.deleted) return drop(); // never sent, or already gone
    }
    const body = payload ? JSON.stringify(payload) : '';
    const hash = payload ? hashBody(body) : 'deleted';
    if (known && known.hash === hash && Boolean(known.deleted) === (payload === null)) {
      return drop(); // the cloud already has exactly this
    }
    const pieces = payload ? splitBody(body) : [''];
    if (pieces.length > MAX_PIECES) {
      this.park(row, 'too-large');
      return null;
    }
    const writes: Write[] = [
      {
        kind: 'record',
        docId,
        doc: {
          kind: row.kind,
          body: pieces[0]!,
          parts: pieces.length - 1,
          deleted: payload === null,
          v: RECORD_VERSION,
          clientUpdatedAt: row.changed_at,
          deviceId: this.deps.deviceId,
        },
        precondition: known ? { updateTime: known.update_time } : { exists: false },
      },
    ];
    pieces.slice(1).forEach((piece, i) =>
      writes.push({
        kind: 'part',
        partId: `${docId}~${i + 1}`,
        record: docId,
        n: i + 1,
        body: piece,
      }),
    );
    // Pieces it no longer needs.
    for (let n = pieces.length; n <= (known?.parts ?? 0); n++) {
      writes.push({ kind: 'delete', path: `parts/${docId}~${n}` });
    }
    return { row, writes, sent: { hash, base: payload ? body : null, parts: pieces.length - 1 } };
  }

  private async commitBatch(batch: { row: Outbox; writes: Write[]; sent: Sent }[]): Promise<void> {
    const token = await this.deps.token();
    try {
      const times = await this.deps.api.commit(
        token,
        this.deps.uid,
        batch.flatMap((b) => b.writes),
      );
      let at = 0;
      for (const b of batch) {
        this.sent(b.row, times[at] ?? '', b.sent);
        at += b.writes.length;
      }
    } catch (error) {
      if (isConflict(error)) {
        // Somebody else changed one of these: one at a time, the odd one gets reconciled.
        if (batch.length > 1) {
          for (const b of batch) await this.commitBatch([b]);
          return;
        }
        await this.reconcile(batch[0]!.row);
        return;
      }
      if (isTransient(error)) {
        for (const b of batch) this.retryLater(b.row, error);
      } else if (!(error instanceof CloudError && error.code === 'PERMISSION_DENIED')) {
        for (const b of batch) this.park(b.row, error instanceof Error ? error.message : 'failed');
      }
      throw error;
    }
  }

  /** Sent: remember what the cloud now has; the queue entry goes unless it changed meanwhile. */
  private sent(row: Outbox, updateTime: string, sent: Sent): void {
    const { db } = this.deps;
    db.prepare(
      `INSERT INTO sync_records (kind, record_id, update_time, hash, base, parts, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (kind, record_id) DO UPDATE SET update_time = excluded.update_time,
         hash = excluded.hash, base = excluded.base, parts = excluded.parts, deleted = excluded.deleted`,
    ).run(row.kind, row.record_id, updateTime, sent.hash, sent.base, sent.parts, sent.base ? 0 : 1);
    db.prepare('DELETE FROM sync_outbox WHERE kind = ? AND record_id = ? AND changed_at = ?').run(
      row.kind,
      row.record_id,
      row.changed_at,
    );
  }

  /** A write was refused because the cloud's copy moved on: bring it in and decide. */
  private async reconcile(row: Outbox): Promise<void> {
    const token = await this.deps.token();
    const remote = await this.deps.api.getRecord(
      token,
      this.deps.uid,
      docIdFor(row.kind, row.record_id),
    );
    if (!remote) {
      // It vanished from the cloud (an account reset): send ours as new.
      this.deps.db
        .prepare('DELETE FROM sync_records WHERE kind = ? AND record_id = ?')
        .run(row.kind, row.record_id);
      return;
    }
    await this.receive([remote]);
  }

  // ── Receiving ───────────────────────────────────────────────────────────────

  private async pull(): Promise<void> {
    this.lastPullAt = this.now();
    for (;;) {
      if (this.stopped) return;
      const cursorJson = this.getState(`cursor:${this.deps.uid}`);
      const cursor = cursorJson
        ? (JSON.parse(cursorJson) as { updatedAt: string; name: string })
        : null;
      const token = await this.deps.token();
      const page = await this.deps.api.changedSince(token, this.deps.uid, cursor, PAGE);
      if (page.length) await this.receive(page);
      const last = page.at(-1);
      if (last) {
        this.setState(
          `cursor:${this.deps.uid}`,
          JSON.stringify({ updatedAt: last.updatedAt, name: last.name }),
        );
      }
      if (page.length < PAGE) return;
    }
  }

  /** Applies cloud records here (or reconciles them with unsent changes). */
  private async receive(records: readonly FetchedRecord[]): Promise<void> {
    const token = await this.deps.token();
    const incoming: {
      kind: SyncKind;
      id: string;
      record: FetchedRecord;
      payload: Payload | null;
    }[] = [];
    for (const record of records) {
      const parsed = parseDocId(record.docId);
      if (!parsed || record.v > RECORD_VERSION) continue; // from a newer Orbit: leave it be
      const known = this.known(parsed.kind, parsed.id);
      if (known?.update_time === record.updateTime) continue; // our own write coming back
      const payload = record.deleted
        ? null
        : (JSON.parse(await this.deps.api.fullBody(token, this.deps.uid, record)) as Payload);
      incoming.push({ ...parsed, record, payload });
    }
    if (incoming.length === 0) return;

    const { db } = this.deps;
    const kinds = new Set<SyncKind>();
    const removed: { kind: SyncKind; id: string }[] = [];
    let conflicts = 0;
    const order = (k: SyncKind) => APPLY_ORDER.indexOf(k);
    // New and changed records parents-first; deletions children-first.
    incoming.sort((a, b) =>
      a.payload && b.payload
        ? order(a.kind) - order(b.kind)
        : a.payload
          ? -1
          : b.payload
            ? 1
            : order(b.kind) - order(a.kind),
    );
    // Foreign keys are checked per record arriving, not per batch: a pinned tab may come before
    // its Space (each deletion arrives as its own record, so nothing relies on cascades).
    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      transaction(db, () => {
        db.prepare('INSERT INTO sync_guard (active) VALUES (1)').run();
        for (const { kind, id, record, payload } of incoming) {
          const pending = db
            .prepare('SELECT changed_at FROM sync_outbox WHERE kind = ? AND record_id = ?')
            .get(kind, id) as { changed_at: number } | undefined;
          const remember = (base: Payload | null) => this.remember(kind, id, record, base);
          if (!pending) {
            this.apply(kind, id, payload, removed);
            kinds.add(kind);
            remember(payload);
            continue;
          }
          const known = this.known(kind, id);
          const local = readRecord(db, kind, id);
          const decision = resolveConflict(
            kind,
            known?.base ? (JSON.parse(known.base) as Payload) : null,
            { payload: local, at: pending.changed_at },
            { payload, at: record.clientUpdatedAt },
          );
          if (decision.action === 'take-remote') {
            this.apply(kind, id, payload, removed);
            kinds.add(kind);
            remember(payload);
            db.prepare('DELETE FROM sync_outbox WHERE kind = ? AND record_id = ?').run(kind, id);
            continue;
          }
          // This Mac's version (or a merge) goes up next, over the cloud's current copy.
          remember(payload);
          if (decision.action === 'merge') {
            writeRecord(db, kind, decision.payload);
            kinds.add(kind);
          } else if (decision.action === 'keep-both' && payload) {
            db.prepare('DELETE FROM sync_guard').run(); // the copy is new: it should sync
            writeCopy(db, kind, payload);
            db.prepare('INSERT INTO sync_guard (active) VALUES (1)').run();
            kinds.add(kind);
            conflicts++;
          }
          db.prepare('UPDATE sync_outbox SET next_at = 0 WHERE kind = ? AND record_id = ?').run(
            kind,
            id,
          );
        }
        db.prepare('DELETE FROM sync_guard').run();
      });
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
    if (conflicts) {
      const total = Number(this.getState('conflicts') ?? 0) + conflicts;
      this.setState('conflicts', String(total));
      this.emit({ conflicts: total });
    }
    if (kinds.size) this.deps.onApplied(kinds, removed);
  }

  private apply(
    kind: SyncKind,
    id: string,
    payload: Payload | null,
    removed: { kind: SyncKind; id: string }[],
  ): void {
    if (payload) writeRecord(this.deps.db, kind, payload);
    else {
      deleteRecord(this.deps.db, kind, id);
      removed.push({ kind, id });
    }
  }

  /** The cloud's copy of a record, as agreed with this Mac. */
  private remember(
    kind: SyncKind,
    id: string,
    record: FetchedRecord,
    payload: Payload | null,
  ): void {
    const body = payload ? JSON.stringify(payload) : null;
    this.deps.db
      .prepare(
        `INSERT INTO sync_records (kind, record_id, update_time, hash, base, parts, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (kind, record_id) DO UPDATE SET update_time = excluded.update_time,
           hash = excluded.hash, base = excluded.base, parts = excluded.parts, deleted = excluded.deleted`,
      )
      .run(
        kind,
        id,
        record.updateTime,
        body ? hashBody(body) : 'deleted',
        body,
        record.parts,
        body ? 0 : 1,
      );
  }

  // ── Bookkeeping ─────────────────────────────────────────────────────────────

  /** Queues every synced record on this Mac (a first sign-in here). Idempotent. */
  private enqueueAll(): void {
    const { db } = this.deps;
    const insert = db.prepare(
      `INSERT INTO sync_outbox (kind, record_id, changed_at) VALUES (?, ?, ?)
       ON CONFLICT (kind, record_id) DO NOTHING`,
    );
    transaction(db, () => {
      for (const kind of APPLY_ORDER) {
        for (const id of recordIds(db, kind)) insert.run(kind, id, this.now());
      }
    });
  }

  /** The account's own document, made once. */
  private async ensureUserDoc(): Promise<void> {
    const key = `user-doc:${this.deps.uid}`;
    if (this.getState(key)) return;
    const token = await this.deps.token();
    try {
      await this.deps.api.commit(token, this.deps.uid, [{ kind: 'user', schema: 1 }]);
    } catch (error) {
      if (!(error instanceof CloudError && error.code === 'ALREADY_EXISTS')) throw error;
    }
    this.setState(key, '1');
  }

  private dueRows(limit = 1000): Outbox[] {
    return this.deps.db
      .prepare(
        `SELECT kind, record_id, changed_at, attempts FROM sync_outbox
         WHERE next_at <= ? ORDER BY changed_at LIMIT ?`,
      )
      .all(this.now(), limit) as Outbox[];
  }

  private retryLater(row: Outbox, error: unknown): void {
    const attempts = row.attempts + 1;
    this.deps.db
      .prepare(
        `UPDATE sync_outbox SET attempts = ?, next_at = ?, last_error = ?
         WHERE kind = ? AND record_id = ?`,
      )
      .run(
        attempts,
        this.now() + backoffMs(attempts, this.deps.random),
        error instanceof Error ? error.message.slice(0, 200) : 'failed',
        row.kind,
        row.record_id,
      );
  }

  /** A change that can't go now (too large; refused): kept, and tried again tomorrow. */
  private park(row: Outbox, reason: string): void {
    this.deps.db
      .prepare(
        `UPDATE sync_outbox SET attempts = attempts + 1, next_at = ?, last_error = ?
         WHERE kind = ? AND record_id = ?`,
      )
      .run(this.now() + 24 * 3_600_000, reason.slice(0, 200), row.kind, row.record_id);
  }

  private hasParked(): boolean {
    return Boolean(
      this.deps.db
        .prepare('SELECT 1 FROM sync_outbox WHERE next_at > ? AND last_error IS NOT NULL LIMIT 1')
        .get(this.now() + 60 * 60_000),
    );
  }

  private parkedMessage(): string {
    const big = this.deps.db
      .prepare("SELECT count(*) AS n FROM sync_outbox WHERE last_error = 'too-large'")
      .get() as { n: number };
    return big.n > 0
      ? `${big.n === 1 ? 'One item is' : `${big.n} items are`} too large to sync.`
      : 'Some changes couldn’t be synced. Orbit will try again later.';
  }

  private pendingCount(): number {
    return (this.deps.db.prepare('SELECT count(*) AS n FROM sync_outbox').get() as { n: number }).n;
  }

  private lastSynced(): number | null {
    const v = this.getState('last-synced');
    return v ? Number(v) : null;
  }

  private known(kind: SyncKind, id: string): Known | undefined {
    return this.deps.db
      .prepare(
        'SELECT update_time, hash, base, parts, deleted FROM sync_records WHERE kind = ? AND record_id = ?',
      )
      .get(kind, id) as Known | undefined;
  }

  private getState(key: string): string | null {
    const row = this.deps.db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  private setState(key: string, value: string): void {
    this.deps.db
      .prepare(
        'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  private emit(patch: Partial<SyncStatus>): void {
    const next = { ...this.status, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next;
    if (!this.stopped) this.deps.onStatus(next);
  }
}

type Sent = { hash: string; base: string | null; parts: number };
