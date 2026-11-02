import { randomUUID } from 'node:crypto';
import type { Database } from '../db';
import { dateKey } from '@shared/work';

export type FocusLogEntry = {
  taskId: string | null;
  projectId: string | null;
  title: string;
  startedAt: number;
  endedAt: number;
  focusedMs: number;
  completed: boolean;
};

/** Finished focus sessions (brief M7): kept on the Mac, for today's total and the week. */
export class FocusLogRepository {
  constructor(private readonly db: Database) {}

  add(entry: FocusLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO focus_log (id, task_id, project_id, title, started_at, ended_at, focused_ms, completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        entry.taskId,
        entry.projectId,
        entry.title.slice(0, 200),
        entry.startedAt,
        entry.endedAt,
        Math.max(0, Math.round(entry.focusedMs)),
        entry.completed ? 1 : 0,
      );
  }

  /** Today's focused time and sessions, and the last 7 days' totals (oldest first), by the
   *  Mac's local dates. */
  summary(now = Date.now()): { todayMs: number; todaySessions: number; week: number[] } {
    const since = now - 8 * 86_400_000;
    const rows = this.db
      .prepare('SELECT ended_at, focused_ms FROM focus_log WHERE ended_at >= ?')
      .all(since) as { ended_at: number; focused_ms: number }[];
    const days = Array.from({ length: 7 }, (_, i) => dateKey(new Date(now - (6 - i) * 86_400_000)));
    const week = days.map(() => 0);
    let todaySessions = 0;
    for (const r of rows) {
      const i = days.indexOf(dateKey(new Date(r.ended_at)));
      if (i < 0) continue;
      week[i]! += r.focused_ms;
      if (i === 6) todaySessions++;
    }
    return { todayMs: week[6]!, todaySessions, week };
  }

  clear(): void {
    this.db.prepare('DELETE FROM focus_log').run();
  }
}
