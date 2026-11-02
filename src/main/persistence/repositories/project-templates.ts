import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BUILT_IN_PROJECT_TEMPLATES, templateTaskSchema } from '@shared/project-templates';
import type { ProjectTemplate, TemplateTask } from '@shared/project-templates';
import type { Database } from '../db';

const PROFILE = 'default';

type Row = {
  id: string;
  name: string;
  description: string;
  color: string;
  tasks_json: string;
  created_at: number;
};

const parseTasks = (json: string): TemplateTask[] => {
  try {
    const result = z.array(templateTaskSchema).safeParse(JSON.parse(json));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
};

const toTemplate = (r: Row): ProjectTemplate => ({
  id: r.id,
  name: r.name,
  description: r.description,
  color: r.color,
  tasks: parseTasks(r.tasks_json),
  builtIn: false,
});

/** Project templates (roadmap P4.1, migration 018): the built-in ones, then yours (newest last). */
export class ProjectTemplateRepository {
  constructor(private readonly db: Database) {}

  list(): ProjectTemplate[] {
    const own = (
      this.db
        .prepare('SELECT * FROM project_templates WHERE profile_id = ? ORDER BY created_at, id')
        .all(PROFILE) as Row[]
    ).map(toTemplate);
    return [...BUILT_IN_PROJECT_TEMPLATES, ...own];
  }

  get(id: string): ProjectTemplate | null {
    const builtIn = BUILT_IN_PROJECT_TEMPLATES.find((t) => t.id === id);
    if (builtIn) return builtIn;
    const row = this.db
      .prepare('SELECT * FROM project_templates WHERE profile_id = ? AND id = ?')
      .get(PROFILE, id) as Row | undefined;
    return row ? toTemplate(row) : null;
  }

  create(
    fields: { name: string; description: string; color: string; tasks: TemplateTask[] },
    now = Date.now(),
  ): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO project_templates (id, profile_id, name, description, color, tasks_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        PROFILE,
        fields.name.trim().slice(0, 60),
        fields.description.slice(0, 300),
        fields.color,
        JSON.stringify(fields.tasks.slice(0, 100)),
        now,
      );
    return id;
  }

  rename(id: string, name: string): void {
    this.db
      .prepare('UPDATE project_templates SET name = ? WHERE profile_id = ? AND id = ?')
      .run(name.trim().slice(0, 60), PROFILE, id);
  }

  delete(id: string): void {
    this.db
      .prepare('DELETE FROM project_templates WHERE profile_id = ? AND id = ?')
      .run(PROFILE, id);
  }
}
