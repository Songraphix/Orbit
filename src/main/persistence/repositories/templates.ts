import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_THEME, spaceThemeSchema } from '@shared/types/space';
import type { SpaceTheme } from '@shared/types/space';
import type { Database } from '../db';
import { templateTabSchema } from '../../sidebar/template-model';
import type { TemplateTab } from '../../sidebar/template-model';

const PROFILE = 'default';

export type SpaceTemplate = {
  id: string;
  name: string;
  icon: string;
  theme: SpaceTheme;
  tabs: TemplateTab[];
  createdAt: number;
};

type Row = {
  id: string;
  name: string;
  icon: string;
  theme_json: string;
  tabs_json: string;
  created_at: number;
};

const parse = <T>(json: string, schema: z.ZodType<T>, fallback: T): T => {
  try {
    const result = schema.safeParse(JSON.parse(json));
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
};

const toTemplate = (r: Row): SpaceTemplate => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  theme: parse(r.theme_json, spaceThemeSchema, DEFAULT_THEME),
  tabs: parse(r.tabs_json, z.array(templateTabSchema), []),
  createdAt: r.created_at,
});

/** Workspace templates (roadmap P2.5, migration 016), newest first. */
export class TemplateRepository {
  constructor(private readonly db: Database) {}

  list(): SpaceTemplate[] {
    return (
      this.db
        .prepare('SELECT * FROM space_templates WHERE profile_id = ? ORDER BY created_at DESC, id')
        .all(PROFILE) as Row[]
    ).map(toTemplate);
  }

  get(id: string): SpaceTemplate | null {
    const row = this.db
      .prepare('SELECT * FROM space_templates WHERE profile_id = ? AND id = ?')
      .get(PROFILE, id) as Row | undefined;
    return row ? toTemplate(row) : null;
  }

  add(t: Omit<SpaceTemplate, 'id' | 'createdAt'>, now = Date.now()): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO space_templates (id, profile_id, name, icon, theme_json, tabs_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        PROFILE,
        t.name.trim().slice(0, 60) || 'Template',
        t.icon,
        JSON.stringify(t.theme),
        JSON.stringify(t.tabs),
        now,
      );
    return id;
  }

  rename(id: string, name: string): void {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    this.db
      .prepare('UPDATE space_templates SET name = ? WHERE profile_id = ? AND id = ?')
      .run(clean, PROFILE, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM space_templates WHERE profile_id = ? AND id = ?').run(PROFILE, id);
  }
}
