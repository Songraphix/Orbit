import { randomUUID } from 'node:crypto';
import { CAPTURE_KINDS, CAPTURE_LIMITS } from '@shared/capture';
import type { Capture, CaptureKind } from '@shared/capture';
import type { Database } from '../db';

const PROFILE = 'default';

type Row = {
  id: string;
  project_id: string | null;
  kind: string;
  title: string;
  url: string;
  text: string;
  language: string;
  has_image: number;
  comment: string;
  task_id: string | null;
  created_at: number;
};

const COLUMNS = `id, project_id, kind, title, url, text, language, image IS NOT NULL AS has_image,
  comment, task_id, created_at`;

const toCapture = (r: Row): Capture => ({
  id: r.id,
  projectId: r.project_id,
  kind: (CAPTURE_KINDS as readonly string[]).includes(r.kind) ? (r.kind as CaptureKind) : 'link',
  title: r.title,
  url: r.url,
  text: r.text,
  language: r.language,
  hasImage: Boolean(r.has_image),
  comment: r.comment,
  taskId: r.task_id,
  createdAt: r.created_at,
});

export type NewCapture = {
  projectId: string | null;
  kind: CaptureKind;
  title: string;
  url: string;
  text: string;
  language: string;
  image: string | null;
  thumb: string | null;
  comment: string;
};

/** Findings saved with Orbit Capture (migration 015), newest first. */
export class CaptureRepository {
  constructor(private readonly db: Database) {}

  add(c: NewCapture, now = Date.now()): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO captures (id, profile_id, project_id, kind, title, url, text, language, image,
           thumb, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        PROFILE,
        c.projectId,
        c.kind,
        c.title.slice(0, CAPTURE_LIMITS.title),
        c.url.slice(0, CAPTURE_LIMITS.url),
        c.text.slice(0, CAPTURE_LIMITS.text),
        c.language.slice(0, 40),
        c.image,
        c.thumb,
        c.comment.trim().slice(0, CAPTURE_LIMITS.comment),
        now,
      );
    return id;
  }

  list(): Capture[] {
    return (
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM captures WHERE profile_id = ? ORDER BY created_at DESC, id`,
        )
        .all(PROFILE) as Row[]
    ).map(toCapture);
  }

  get(id: string): Capture | null {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM captures WHERE profile_id = ? AND id = ?`)
      .get(PROFILE, id) as Row | undefined;
    return row ? toCapture(row) : null;
  }

  /** The screenshot (full) or its thumbnail, as a data: URL. */
  image(id: string, size: 'full' | 'thumb'): string | null {
    const row = this.db
      .prepare(`SELECT image, thumb FROM captures WHERE profile_id = ? AND id = ?`)
      .get(PROFILE, id) as { image: string | null; thumb: string | null } | undefined;
    if (!row) return null;
    return size === 'thumb' ? (row.thumb ?? row.image) : row.image;
  }

  setProject(id: string, projectId: string | null): void {
    this.db
      .prepare('UPDATE captures SET project_id = ? WHERE profile_id = ? AND id = ?')
      .run(projectId, PROFILE, id);
  }

  linkTask(id: string, taskId: string): void {
    this.db
      .prepare('UPDATE captures SET task_id = ? WHERE profile_id = ? AND id = ?')
      .run(taskId, PROFILE, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM captures WHERE profile_id = ? AND id = ?').run(PROFILE, id);
  }

  /** A project was deleted: its research stays, Unsorted. */
  unlinkProject(projectId: string): void {
    this.db
      .prepare('UPDATE captures SET project_id = NULL WHERE profile_id = ? AND project_id = ?')
      .run(PROFILE, projectId);
  }

  /** A task was deleted: findings made into it are free again. */
  unlinkTask(taskId: string): void {
    this.db
      .prepare('UPDATE captures SET task_id = NULL WHERE profile_id = ? AND task_id = ?')
      .run(PROFILE, taskId);
  }
}
