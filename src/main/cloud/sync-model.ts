import { createHash } from 'node:crypto';

/**
 * Cloud sync's pure rules (docs/FIREBASE.md): how records are named, split, retried and
 * reconciled. No I/O, no Electron — unit tested.
 */

export const SYNC_KINDS = ['profile', 'space', 'item', 'project', 'task', 'note', 'easel'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/** Notes and Easels are written content: two edits are never merged or dropped — both are kept. */
export const CONTENT_KINDS: ReadonlySet<SyncKind> = new Set(['note', 'easel']);

/** The record format in the cloud; raised when a payload's shape changes. */
export const RECORD_VERSION = 1;

/** A record's JSON fields (its columns that sync). */
export type Payload = Record<string, unknown>;

const isKind = (k: string): k is SyncKind => (SYNC_KINDS as readonly string[]).includes(k);

/** `note_<id>`: one document per record, stable across retries (so they're idempotent). */
export function docIdFor(kind: SyncKind, id: string): string {
  return `${kind}_${id}`;
}

export function parseDocId(docId: string): { kind: SyncKind; id: string } | null {
  const at = docId.indexOf('_');
  if (at < 1) return null;
  const kind = docId.slice(0, at);
  const id = docId.slice(at + 1);
  return isKind(kind) && id ? { kind, id } : null;
}

/** Characters per stored piece: ≤ 3 UTF-8 bytes each keeps a piece under Firestore's 1 MiB. */
export const PIECE_CHARS = 300_000;
/** The most pieces a record may have (≈ 12 MB of JSON); bigger records don't sync. */
export const MAX_PIECES = 41;

/** Splits a record's JSON into pieces, never between the two halves of a surrogate pair. */
export function splitBody(body: string, size = PIECE_CHARS): string[] {
  if (body.length <= size) return [body];
  const pieces: string[] = [];
  let at = 0;
  while (at < body.length) {
    let end = Math.min(at + size, body.length);
    const last = body.charCodeAt(end - 1);
    if (end < body.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    pieces.push(body.slice(at, end));
    at = end;
  }
  return pieces;
}

export function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('base64url');
}

/**
 * Waiting time before retry `attempt` (1, 2, 3…): exponential from 2 s, capped at 15 min, with
 * jitter (50–100 % of the step) so many Macs coming back online don't retry in step.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const step = Math.min(15 * 60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(step * (0.5 + random() * 0.5));
}

/** A change waits this long for quiet before it's sent (typing a note saves often)… */
export const QUIET_MS = 3_000;
/** …but never longer than this after the first unsent change. */
export const MAX_WAIT_MS = 30_000;

/** Whether queued changes should go now: quiet for a moment, or waiting long enough. */
export function readyToSend(changedAts: readonly number[], now: number): boolean {
  if (changedAts.length === 0) return false;
  const newest = Math.max(...changedAts);
  const oldest = Math.min(...changedAts);
  return now - newest >= QUIET_MS || now - oldest >= MAX_WAIT_MS;
}

/** One side of a conflict: the record as that side has it (null: deleted), and when it changed. */
export type Side = { payload: Payload | null; at: number };

export type Resolution =
  /** Take the cloud's version here. */
  | { action: 'take-remote' }
  /** Send this Mac's version (it replaces the cloud's). */
  | { action: 'send-local' }
  /** Both changed different things (or the same thing — the later wins): this merged record. */
  | { action: 'merge'; payload: Payload }
  /** Written content changed on both sides: keep this Mac's here, and the cloud's as a copy. */
  | { action: 'keep-both' };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * When this Mac has unsent changes to a record the cloud also changed. `base` is the version
 * both last agreed on (null: never synced from here).
 *
 * - Identical: nothing to do but send (or take — they're equal).
 * - Only one side changed since `base`: that side wins.
 * - Never synced from here (a second Mac's first sign-in): the cloud's small records win (they
 *   are the ones you've been using); written content keeps both if it differs.
 * - Both changed written content: keep both. Small records merge field by field; a field both
 *   changed goes to the later edit. Deleted on one side and edited on the other: the edit wins
 *   for written content (nothing lost); for small records, the later of the two.
 */
export function resolveConflict(
  kind: SyncKind,
  base: Payload | null,
  local: Side,
  remote: Side,
): Resolution {
  if (same(local.payload, remote.payload)) return { action: 'take-remote' };
  const content = CONTENT_KINDS.has(kind);
  if (base === null) {
    if (content && local.payload && remote.payload) return { action: 'keep-both' };
    if (content && local.payload) return { action: 'send-local' };
    return remote.payload ? { action: 'take-remote' } : { action: 'send-local' };
  }
  const localChanged = !same(local.payload, base);
  const remoteChanged = !same(remote.payload, base);
  if (!localChanged) return { action: 'take-remote' };
  if (!remoteChanged) return { action: 'send-local' };
  // Both changed.
  if (local.payload === null || remote.payload === null) {
    if (content) return local.payload ? { action: 'send-local' } : { action: 'take-remote' };
    return local.at >= remote.at ? { action: 'send-local' } : { action: 'take-remote' };
  }
  if (content) return { action: 'keep-both' };
  return { action: 'merge', payload: mergeFields(base, local, remote) };
}

/** Field-by-field: each side's own changes are kept; a field both changed goes to the later. */
export function mergeFields(base: Payload, local: Side, remote: Side): Payload {
  const l = local.payload ?? {};
  const r = remote.payload ?? {};
  const merged: Payload = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(l), ...Object.keys(r)])) {
    const lChanged = !same(l[key], base[key]);
    const rChanged = !same(r[key], base[key]);
    if (lChanged && rChanged) merged[key] = local.at >= remote.at ? l[key] : r[key];
    else if (rChanged) merged[key] = r[key];
    else merged[key] = l[key];
  }
  return merged;
}
