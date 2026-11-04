import { randomUUID } from 'node:crypto';
import type { Database } from '../persistence/db';
import type { Payload, SyncKind } from './sync-model';

/**
 * Which of Orbit's tables sync, and which of their columns (docs/FIREBASE.md). What stays on
 * this Mac: Today tabs, history, live page titles and favicons, when something was last
 * opened, Easel previews — browsing inside a pinned tab never causes an upload.
 */
type Table = {
  kind: SyncKind;
  table: string;
  /** The columns that sync, `id` first (their order is the payload's, for stable hashes). */
  fields: readonly string[];
  /** Rows that sync (the rest stay local). */
  where?: string;
};

export const SYNC_TABLES: readonly Table[] = [
  {
    kind: 'profile',
    table: 'profiles',
    fields: ['id', 'name', 'partition', 'display_name', 'avatar', 'color', 'created_at'],
  },
  {
    kind: 'space',
    table: 'spaces',
    fields: ['id', 'profile_id', 'name', 'icon', 'theme_json', 'sort_key', 'created_at'],
  },
  {
    kind: 'item',
    table: 'sidebar_items',
    // `url` only for items with no home (a pinned tab's home is what syncs, not where it is).
    fields: [
      'id',
      'profile_id',
      'space_id',
      'parent_id',
      'section',
      'kind',
      'sort_key',
      'title_override',
      'url',
      'home_url',
      'collapsed',
      'data_json',
      'created_at',
    ],
    where: "section != 'today'",
  },
  {
    kind: 'project',
    table: 'projects',
    fields: [
      'id',
      'profile_id',
      'name',
      'description',
      'status',
      'color',
      'start_date',
      'due_date',
      'space_id',
      'github_repo',
      'created_at',
      'updated_at',
    ],
  },
  {
    kind: 'task',
    table: 'tasks',
    fields: [
      'id',
      'profile_id',
      'project_id',
      'title',
      'description',
      'priority',
      'status',
      'due_date',
      'completed_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    kind: 'note',
    table: 'notes',
    fields: ['id', 'profile_id', 'project_id', 'doc_json', 'text', 'created_at', 'updated_at'],
  },
  {
    kind: 'easel',
    table: 'easels',
    fields: [
      'id',
      'profile_id',
      'space_id',
      'title',
      'scene_json',
      'background',
      'created_at',
      'updated_at',
    ],
  },
];

/** Applied in this order, so a Space arrives before its tabs and a project before its tasks. */
export const APPLY_ORDER: readonly SyncKind[] = SYNC_TABLES.map((t) => t.kind);

const tableFor = (kind: SyncKind): Table => SYNC_TABLES.find((t) => t.kind === kind)!;

/** A record as it syncs, or null if it's gone (or not something that syncs, like a Today tab). */
export function readRecord(db: Database, kind: SyncKind, id: string): Payload | null {
  const t = tableFor(kind);
  const row = db
    .prepare(
      `SELECT ${t.fields.join(', ')} FROM ${t.table} WHERE id = ?${t.where ? ` AND ${t.where}` : ''}`,
    )
    .get(id) as Payload | undefined;
  if (!row) return null;
  const payload: Payload = { ...row };
  if (kind === 'item' && payload['home_url']) payload['url'] = null;
  return payload;
}

/** Every synced record's id (a first sign-in sends them all). */
export function recordIds(db: Database, kind: SyncKind): string[] {
  const t = tableFor(kind);
  const rows = db
    .prepare(`SELECT id FROM ${t.table}${t.where ? ` WHERE ${t.where}` : ''}`)
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}

/** Writes a record from the cloud, keeping this Mac's own columns (live title, preview…). */
export function writeRecord(db: Database, kind: SyncKind, payload: Payload): void {
  const t = tableFor(kind);
  const values = t.fields.map((f) => toSql(payload[f]));
  const keepUrl = kind === 'item' && payload['url'] == null;
  if (keepUrl) values[t.fields.indexOf('url')] = toSql(payload['home_url']);
  const updates = t.fields
    .filter((f) => f !== 'id')
    .map((f) =>
      // A pinned tab keeps where it is here; only its home comes from the cloud.
      f === 'url' && keepUrl
        ? `url = COALESCE(${t.table}.url, excluded.url)`
        : `${f} = excluded.${f}`,
    );
  db.prepare(
    `INSERT INTO ${t.table} (${t.fields.join(', ')}) VALUES (${t.fields.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
  ).run(...values);
}

export function deleteRecord(db: Database, kind: SyncKind, id: string): void {
  db.prepare(`DELETE FROM ${tableFor(kind).table} WHERE id = ?`).run(id);
}

/**
 * Written content edited on two Macs: the cloud's version is kept beside this Mac's as a copy
 * (a new record, which then syncs like any other). Returns its id.
 */
export function writeCopy(db: Database, kind: SyncKind, payload: Payload): string {
  const id = randomUUID();
  const copy: Payload = { ...payload, id };
  if (kind === 'easel') copy['title'] = `${String(payload['title'] ?? 'Easel')} (other Mac)`;
  writeRecord(db, kind, copy);
  return id;
}

type SqlValue = string | number | bigint | null | Uint8Array;
function toSql(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}
