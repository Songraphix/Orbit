import { randomUUID } from 'node:crypto';
import type { Shortcut, Todo } from '@shared/types/home';
import { MAX_SHORTCUTS } from '@shared/types/home';
import type { Database } from '../db';
import { visibleTodos } from '../../newtab/home-model';

/** The new tab page's shortcuts and Today list, per profile (migration 012). */
export class HomeRepository {
  constructor(private readonly db: Database) {}

  shortcuts(profileId: string): Shortcut[] {
    return this.db
      .prepare('SELECT id, title, url, icon FROM home_shortcuts WHERE profile_id = ? ORDER BY sort')
      .all(profileId) as Shortcut[];
  }

  /** Adds a shortcut at the end; false when the row is full. */
  addShortcut(
    profileId: string,
    s: { title: string; url: string; icon: string | null },
    now = Date.now(),
  ): boolean {
    const { n, last } = this.db
      .prepare('SELECT COUNT(*) AS n, MAX(sort) AS last FROM home_shortcuts WHERE profile_id = ?')
      .get(profileId) as { n: number; last: number | null };
    if (n >= MAX_SHORTCUTS) return false;
    this.db
      .prepare(
        `INSERT INTO home_shortcuts (id, profile_id, title, url, icon, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), profileId, s.title, s.url, s.icon, (last ?? 0) + 1, now);
    return true;
  }

  removeShortcut(profileId: string, id: string): void {
    this.db
      .prepare('DELETE FROM home_shortcuts WHERE profile_id = ? AND id = ?')
      .run(profileId, id);
  }

  /** True the first time it's asked for a profile (its shortcuts are then filled in). */
  claimSeed(profileId: string): boolean {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO home_seeded (profile_id) VALUES (?)')
      .run(profileId);
    return Number(result.changes) > 0;
  }

  todos(profileId: string, now = Date.now()): Todo[] {
    const rows = this.db
      .prepare('SELECT id, text, done_at, created_at FROM home_todos WHERE profile_id = ?')
      .all(profileId) as { id: string; text: string; done_at: number | null; created_at: number }[];
    return visibleTodos(
      rows.map((r) => ({ id: r.id, text: r.text, doneAt: r.done_at, createdAt: r.created_at })),
      now,
    ).map((t) => ({ id: t.id, text: t.text, done: t.doneAt !== null }));
  }

  addTodo(profileId: string, text: string, now = Date.now()): void {
    this.db
      .prepare('INSERT INTO home_todos (id, profile_id, text, created_at) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), profileId, text, now);
  }

  toggleTodo(profileId: string, id: string, now = Date.now()): void {
    this.db
      .prepare(
        `UPDATE home_todos SET done_at = CASE WHEN done_at IS NULL THEN ? ELSE NULL END
         WHERE profile_id = ? AND id = ?`,
      )
      .run(now, profileId, id);
  }

  removeTodo(profileId: string, id: string): void {
    this.db.prepare('DELETE FROM home_todos WHERE profile_id = ? AND id = ?').run(profileId, id);
  }

  /** Done items from before the last week go for good. */
  pruneTodos(now = Date.now()): void {
    this.db
      .prepare('DELETE FROM home_todos WHERE done_at IS NOT NULL AND done_at < ?')
      .run(now - 7 * 86_400_000);
  }
}
