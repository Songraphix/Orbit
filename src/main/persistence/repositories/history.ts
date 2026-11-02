import { buildFtsQuery, historyScore, hostOf, isRecordable } from '../../history/model';
import type { Database } from '../db';

export type HistoryEntry = {
  url: string;
  title: string;
  visitCount: number;
  lastVisitAt: number;
  /** Favicon for the page's host, if one was seen. */
  favicon: string | null;
};

const PROFILE = 'default'; // profiles arrive in Phase 3

/** Browsing history with FTS5 search (PLAN.md sections 4.3 and 5.2), plus favicons by host. */
export class HistoryRepository {
  constructor(private readonly db: Database) {}

  /** Records a visit: inserts the page, or bumps its count and time. */
  recordVisit(url: string, title: string, now = Date.now()): void {
    if (!isRecordable(url)) return;
    this.db
      .prepare(
        `INSERT INTO history (profile_id, url, title, visit_count, last_visit_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT (profile_id, url) DO UPDATE SET
           visit_count = visit_count + 1,
           last_visit_at = excluded.last_visit_at,
           title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE title END`,
      )
      .run(PROFILE, url, title, now);
  }

  /** Pages get their real title after the visit is recorded. */
  updateTitle(url: string, title: string): void {
    if (!isRecordable(url) || !title) return;
    this.db
      .prepare('UPDATE history SET title = ? WHERE profile_id = ? AND url = ? AND title <> ?')
      .run(title, PROFILE, url, title);
  }

  /** Full-text search over titles and URLs, ranked by relevance + frecency. */
  search(query: string, limit = 8, now = Date.now()): HistoryEntry[] {
    const fts = buildFtsQuery(query);
    if (!fts) return [];
    const rows = this.db
      .prepare(
        `SELECT h.url, h.title, h.visit_count AS visitCount, h.last_visit_at AS lastVisitAt,
                bm25(history_fts, 4.0, 1.0) AS bm25
           FROM history_fts JOIN history h ON h.id = history_fts.rowid
          WHERE history_fts MATCH ? AND h.profile_id = ?
          ORDER BY bm25 LIMIT 60`,
      )
      .all(fts, PROFILE) as (Omit<HistoryEntry, 'favicon'> & { bm25: number })[];
    return rows
      .map((r) => ({ ...r, score: historyScore(r, query, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ url, title, visitCount, lastVisitAt }) => ({
        url,
        title,
        visitCount,
        lastVisitAt,
        favicon: this.faviconFor(url),
      }));
  }

  /** Most visited recent pages (for new tab shortcuts). */
  topSites(limit = 8): HistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT url, title, visit_count AS visitCount, last_visit_at AS lastVisitAt
           FROM history WHERE profile_id = ?
          ORDER BY visit_count DESC, last_visit_at DESC LIMIT ?`,
      )
      .all(PROFILE, limit) as Omit<HistoryEntry, 'favicon'>[];
    return rows.map((r) => ({ ...r, favicon: this.faviconFor(r.url) }));
  }

  /** Pages opened lately, newest first (the Homepage's Recently Visited). */
  recent(limit = 8): HistoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT url, title, visit_count AS visitCount, last_visit_at AS lastVisitAt
           FROM history WHERE profile_id = ?
          ORDER BY last_visit_at DESC LIMIT ?`,
      )
      .all(PROFILE, limit) as Omit<HistoryEntry, 'favicon'>[];
    return rows.map((r) => ({ ...r, favicon: this.faviconFor(r.url) }));
  }

  /** Imported history (Arc importer, Phase 3) arrives in bulk. */
  importVisits(
    entries: { url: string; title: string; visitCount: number; lastVisitAt: number }[],
  ): number {
    const insert = this.db.prepare(
      `INSERT INTO history (profile_id, url, title, visit_count, last_visit_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (profile_id, url) DO UPDATE SET
         visit_count = MAX(visit_count, excluded.visit_count),
         last_visit_at = MAX(last_visit_at, excluded.last_visit_at)`,
    );
    let count = 0;
    this.db.exec('BEGIN');
    try {
      for (const e of entries) {
        if (!isRecordable(e.url)) continue;
        insert.run(PROFILE, e.url, e.title, Math.max(1, e.visitCount), e.lastVisitAt);
        count++;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return count;
  }

  setFavicon(url: string, dataUrl: string, now = Date.now()): void {
    const host = hostOf(url);
    if (!host || dataUrl.length > 64 * 1024) return;
    this.db
      .prepare(
        `INSERT INTO favicons (host, data_url, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (host) DO UPDATE SET data_url = excluded.data_url, updated_at = excluded.updated_at`,
      )
      .run(host, dataUrl, now);
  }

  faviconFor(url: string): string | null {
    const host = hostOf(url);
    if (!host) return null;
    const row = this.db.prepare('SELECT data_url FROM favicons WHERE host = ?').get(host) as
      { data_url: string } | undefined;
    return row?.data_url ?? null;
  }

  clear(): void {
    this.db.prepare('DELETE FROM history WHERE profile_id = ?').run(PROFILE);
  }
}
