import { randomUUID } from 'node:crypto';
import { buildFtsQuery } from '../../history/model';
import type { Database } from '../db';

export type ArchiveReason = 'auto' | 'closed' | 'cleared';

export type ArchiveEntry = {
  id: string;
  spaceId: string | null;
  profileId: string;
  url: string;
  title: string;
  favicon: string | null;
  reason: ArchiveReason;
  archivedAt: number;
};

type Row = {
  id: string;
  space_id: string | null;
  profile_id: string;
  url: string;
  title: string;
  favicon: string | null;
  reason: ArchiveReason;
  archived_at: number;
};

const toEntry = (r: Row): ArchiveEntry => ({
  id: r.id,
  spaceId: r.space_id,
  profileId: r.profile_id,
  url: r.url,
  title: r.title,
  favicon: r.favicon,
  reason: r.reason,
  archivedAt: r.archived_at,
});

/** Archived Today tabs (F-20): searchable, restorable, and what ⇧⌘T brings back. */
export class ArchiveRepository {
  constructor(private readonly db: Database) {}

  add(entry: Omit<ArchiveEntry, 'id' | 'archivedAt'> & { archivedAt?: number }): ArchiveEntry {
    const full: ArchiveEntry = {
      ...entry,
      id: randomUUID(),
      archivedAt: entry.archivedAt ?? Date.now(),
    };
    const favicon = full.favicon && full.favicon.length <= 64 * 1024 ? full.favicon : null;
    this.db
      .prepare(
        `INSERT INTO archive (id, space_id, profile_id, url, title, favicon, reason, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        full.id,
        full.spaceId,
        full.profileId,
        full.url,
        full.title,
        favicon,
        full.reason,
        full.archivedAt,
      );
    return full;
  }

  get(id: string): ArchiveEntry | null {
    const row = this.db.prepare('SELECT * FROM archive WHERE id = ?').get(id) as Row | undefined;
    return row ? toEntry(row) : null;
  }

  /** Removes and returns the most recently archived entry (⇧⌘T). */
  takeLatest(): ArchiveEntry | null {
    const row = this.db
      .prepare('SELECT * FROM archive ORDER BY archived_at DESC, rowid DESC LIMIT 1')
      .get() as Row | undefined;
    if (!row) return null;
    this.remove(row.id);
    return toEntry(row);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM archive WHERE id = ?').run(id);
  }

  /** Newest first; with a query, full-text search over titles and URLs. */
  list(query = '', limit = 300): ArchiveEntry[] {
    const fts = buildFtsQuery(query);
    const rows = fts
      ? (this.db
          .prepare(
            `SELECT a.* FROM archive_fts JOIN archive a ON a.rowid = archive_fts.rowid
              WHERE archive_fts MATCH ? ORDER BY a.archived_at DESC LIMIT ?`,
          )
          .all(fts, limit) as Row[])
      : (this.db
          .prepare('SELECT * FROM archive ORDER BY archived_at DESC, rowid DESC LIMIT ?')
          .all(limit) as Row[]);
    return rows.map(toEntry);
  }

  /** Keeps the archive bounded (oldest entries beyond `keep` are dropped). */
  prune(keep = 5000): void {
    this.db
      .prepare(
        `DELETE FROM archive WHERE id IN (
           SELECT id FROM archive ORDER BY archived_at DESC LIMIT -1 OFFSET ?)`,
      )
      .run(keep);
  }
}
