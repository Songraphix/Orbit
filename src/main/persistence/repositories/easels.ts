import { randomUUID } from 'node:crypto';
import type { Database } from '../db';
import type { EaselBackground } from '@shared/types/easels';

const PROFILE = 'default';

export type Easel = {
  id: string;
  spaceId: string | null;
  title: string;
  /** The Excalidraw scene as JSON ('' for a new, empty easel). */
  scene: string;
  preview: string | null;
  background: EaselBackground;
  updatedAt: number;
};

type Row = {
  id: string;
  space_id: string | null;
  title: string;
  scene_json: string;
  preview: string | null;
  background: string;
  updated_at: number;
};

const toEasel = (row: Row): Easel => ({
  id: row.id,
  spaceId: row.space_id,
  title: row.title,
  scene: row.scene_json,
  preview: row.preview,
  background: (['grid', 'dots'] as const).find((b) => b === row.background) ?? 'plain',
  updatedAt: row.updated_at,
});

/** Easels (F-19), stored in SQLite (PLAN.md section 5.2). */
export class EaselRepository {
  constructor(private readonly db: Database) {}

  /** Newest first, without their scenes (Library → Easels). */
  list(): Omit<Easel, 'scene' | 'background'>[] {
    const rows = this.db
      .prepare(
        `SELECT id, space_id, title, preview, updated_at FROM easels
         WHERE profile_id = ? ORDER BY updated_at DESC, id`,
      )
      .all(PROFILE) as Omit<Row, 'scene_json' | 'background'>[];
    return rows.map((row) => ({
      id: row.id,
      spaceId: row.space_id,
      title: row.title,
      preview: row.preview,
      updatedAt: row.updated_at,
    }));
  }

  get(id: string): Easel | null {
    const row = this.db
      .prepare('SELECT * FROM easels WHERE profile_id = ? AND id = ?')
      .get(PROFILE, id) as Row | undefined;
    return row ? toEasel(row) : null;
  }

  create(fields: { title: string; spaceId: string | null }, now = Date.now()): Easel {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO easels (id, profile_id, space_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, PROFILE, fields.spaceId, fields.title, now, now);
    return this.get(id)!;
  }

  update(
    id: string,
    patch: { title?: string; scene?: string; preview?: string | null },
    now = Date.now(),
  ): boolean {
    const current = this.get(id);
    if (!current) return false;
    this.db
      .prepare(
        `UPDATE easels SET title = ?, scene_json = ?, preview = ?, updated_at = ?
         WHERE profile_id = ? AND id = ?`,
      )
      .run(
        patch.title ?? current.title,
        patch.scene ?? current.scene,
        patch.preview === undefined ? current.preview : patch.preview,
        now,
        PROFILE,
        id,
      );
    return true;
  }

  setBackground(id: string, background: EaselBackground): void {
    this.db
      .prepare('UPDATE easels SET background = ? WHERE profile_id = ? AND id = ?')
      .run(background, PROFILE, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM easels WHERE profile_id = ? AND id = ?').run(PROFILE, id);
  }
}
