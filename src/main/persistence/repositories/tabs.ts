import { transaction } from '../db';
import type { Database } from '../db';

export type SavedTab = {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  isActive: boolean;
};

/** Favicons are small data: URLs; anything bigger isn't worth keeping. */
const MAX_FAVICON_CHARS = 64 * 1024;

/** The open tabs of the main window, for session restore (PLAN.md section 5.3). */
export class TabsRepository {
  constructor(private readonly db: Database) {}

  load(): SavedTab[] {
    const rows = this.db
      .prepare('SELECT id, url, title, favicon, is_active FROM tabs ORDER BY position')
      .all() as {
      id: string;
      url: string;
      title: string;
      favicon: string | null;
      is_active: number;
    }[];
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      favicon: r.favicon,
      isActive: r.is_active === 1,
    }));
  }

  /** Replaces the saved list in one transaction (a few dozen rows; simpler than diffing). */
  saveAll(tabs: readonly SavedTab[]): void {
    const now = Date.now();
    transaction(this.db, () => {
      this.db.exec('DELETE FROM tabs');
      const insert = this.db.prepare(
        'INSERT INTO tabs (id, position, url, title, favicon, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      tabs.forEach((t, position) => {
        const favicon = t.favicon && t.favicon.length <= MAX_FAVICON_CHARS ? t.favicon : null;
        insert.run(t.id, position, t.url, t.title, favicon, t.isActive ? 1 : 0, now);
      });
    });
  }
}
