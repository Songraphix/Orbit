import { randomUUID } from 'node:crypto';
import { githubRepo } from '@shared/github';
import {
  PRIORITIES,
  PROJECT_COLORS,
  PROJECT_STATUSES,
  TASK_STATUSES,
  dateKey,
  projectProblem,
  taskProblem,
} from '@shared/work';
import type { Project, ProjectInput, ProjectStatus, Task, TaskInput, WorkData } from '@shared/work';
import { transaction } from '../db';
import type { Database } from '../db';

const PROFILE = 'default';

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  color: string;
  start_date: string | null;
  due_date: string | null;
  space_id: string | null;
  last_opened_at: number | null;
  github_repo: string | null;
  created_at: number;
  updated_at: number;
};
type TaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T =>
  (values as readonly string[]).includes(value) ? (value as T) : fallback;
const date = (value: string | null) => (value && DATE.test(value) ? value : null);

// Rows are read defensively: an unknown status or colour (older data, a hand edit) falls back.
const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  status: oneOf(PROJECT_STATUSES, r.status, 'active'),
  color: oneOf(
    PROJECT_COLORS.map((c) => c.id),
    r.color,
    'purple',
  ),
  startDate: date(r.start_date),
  dueDate: date(r.due_date),
  spaceId: r.space_id,
  lastOpenedAt: r.last_opened_at,
  githubRepo: r.github_repo,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toTask = (r: TaskRow): Task => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  description: r.description,
  priority: oneOf(PRIORITIES, r.priority, 'medium'),
  status: oneOf(TASK_STATUSES, r.status, 'todo'),
  dueDate: date(r.due_date),
  completedAt: r.completed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class WorkError extends Error {
  override name = 'WorkError';
}

/** Projects and tasks (migration 013). Progress is counted from tasks, never stored. */
export class WorkRepository {
  constructor(private readonly db: Database) {}

  all(): Pick<WorkData, 'projects' | 'tasks'> {
    const projects = (
      this.db
        .prepare('SELECT * FROM projects WHERE profile_id = ? ORDER BY created_at, id')
        .all(PROFILE) as ProjectRow[]
    ).map(toProject);
    const tasks = (
      this.db
        .prepare('SELECT * FROM tasks WHERE profile_id = ? ORDER BY created_at, id')
        .all(PROFILE) as TaskRow[]
    ).map(toTask);
    return { projects, tasks };
  }

  /** Creates (no id) or updates a project. Returns its id. */
  saveProject(input: ProjectInput, now = Date.now()): string {
    const problem = projectProblem(input);
    if (problem) throw new WorkError(problem);
    const repo = input.githubRepo ? githubRepo(input.githubRepo) : null;
    if (input.githubRepo && !repo) throw new WorkError('Use owner/repository for GitHub');
    const fields = [
      input.name.trim(),
      input.description.trim(),
      input.status,
      input.color,
      input.startDate,
      input.dueDate,
      input.spaceId,
    ];
    if (input.id) {
      // An edit without the field (older callers) keeps the repository as it was.
      const keep = input.githubRepo === undefined;
      const result = this.db
        .prepare(
          `UPDATE projects SET name = ?, description = ?, status = ?, color = ?, start_date = ?,
             due_date = ?, space_id = ?, github_repo = CASE WHEN ? THEN github_repo ELSE ? END,
             updated_at = ? WHERE profile_id = ? AND id = ?`,
        )
        .run(...fields, keep ? 1 : 0, repo, now, PROFILE, input.id);
      if (Number(result.changes) === 0) throw new WorkError('That project no longer exists');
      return input.id;
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO projects (id, profile_id, name, description, status, color, start_date,
           due_date, space_id, github_repo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, PROFILE, ...fields, repo, now, now);
    return id;
  }

  /** Its page was opened (for "Continue where you left off"). */
  markOpened(id: string, now = Date.now()): void {
    this.db
      .prepare('UPDATE projects SET last_opened_at = ? WHERE profile_id = ? AND id = ?')
      .run(now, PROFILE, id);
  }

  setProjectStatus(id: string, status: ProjectStatus, now = Date.now()): void {
    this.db
      .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE profile_id = ? AND id = ?')
      .run(status, now, PROFILE, id);
  }

  project(id: string): Project | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE profile_id = ? AND id = ?')
      .get(PROFILE, id) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  /** Deletes a project; its tasks go too, or stay without a project (`keepTasks`). */
  deleteProject(id: string, keepTasks: boolean): void {
    transaction(this.db, () => {
      if (keepTasks) {
        this.db
          .prepare('UPDATE tasks SET project_id = NULL WHERE profile_id = ? AND project_id = ?')
          .run(PROFILE, id);
      } else {
        this.db
          .prepare('DELETE FROM tasks WHERE profile_id = ? AND project_id = ?')
          .run(PROFILE, id);
      }
      this.db.prepare('DELETE FROM projects WHERE profile_id = ? AND id = ?').run(PROFILE, id);
    });
  }

  /** Creates (no id) or updates a task. Returns its id. */
  saveTask(input: TaskInput, now = Date.now()): string {
    const problem = taskProblem(input);
    if (problem) throw new WorkError(problem);
    if (input.projectId && !this.project(input.projectId)) {
      throw new WorkError('That project no longer exists');
    }
    const current = input.id ? this.task(input.id) : null;
    if (input.id && !current) throw new WorkError('That task no longer exists');
    const completedAt =
      input.status === 'done' ? (current?.status === 'done' ? current.completedAt : now) : null;
    const fields = [
      input.projectId,
      input.title.trim(),
      input.description.trim(),
      input.priority,
      input.status,
      input.dueDate,
      completedAt,
    ];
    if (current) {
      this.db
        .prepare(
          `UPDATE tasks SET project_id = ?, title = ?, description = ?, priority = ?, status = ?,
             due_date = ?, completed_at = ?, updated_at = ? WHERE profile_id = ? AND id = ?`,
        )
        .run(...fields, now, PROFILE, current.id);
      return current.id;
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO tasks (id, profile_id, project_id, title, description, priority, status,
           due_date, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, PROFILE, ...fields, now, now);
    return id;
  }

  task(id: string): Task | null {
    const row = this.db
      .prepare('SELECT * FROM tasks WHERE profile_id = ? AND id = ?')
      .get(PROFILE, id) as TaskRow | undefined;
    return row ? toTask(row) : null;
  }

  /** Done ↔ to do (the checkbox); or straight to a board column. */
  setTaskStatus(id: string, status: Task['status'], now = Date.now()): void {
    const task = this.task(id);
    if (!task || task.status === status) return;
    this.db
      .prepare(
        `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?
         WHERE profile_id = ? AND id = ?`,
      )
      .run(status, status === 'done' ? now : null, now, PROFILE, id);
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE profile_id = ? AND id = ?').run(PROFILE, id);
  }

  /**
   * The owner's sample projects, the very first time and only into an empty list — never again
   * after (even if they're all deleted). Tasks give each a real progress figure.
   */
  seedSamples(now = Date.now()): boolean {
    const seeded = this.db.prepare(`SELECT 1 FROM work_meta WHERE key = 'seeded'`).get();
    if (seeded) return false;
    const empty = !this.db.prepare('SELECT 1 FROM projects LIMIT 1').get();
    transaction(this.db, () => {
      this.db.prepare(`INSERT INTO work_meta (key, value) VALUES ('seeded', ?)`).run(String(now));
      if (!empty) return;
      const day = (offset: number) => dateKey(now + offset * 86_400_000);
      const samples: {
        name: string;
        description: string;
        color: Project['color'];
        status: ProjectStatus;
        tasks: [string, Task['priority'], Task['status'], number | null][];
      }[] = [
        {
          name: 'SIRATEQ Brand Guide',
          description: 'Brand identity, guide and assets.',
          color: 'purple',
          status: 'active',
          tasks: [
            ['Logo variations', 'high', 'done', -6],
            ['Colour palette', 'medium', 'done', -4],
            ['Typography system', 'medium', 'done', -2],
            ['Brand voice', 'low', 'done', -1],
            ['Finish brand guide', 'high', 'doing', 0],
          ],
        },
        {
          name: 'KraitiveSon Content',
          description: 'Content plan, design and publishing.',
          color: 'blue',
          status: 'active',
          tasks: [
            ['Content calendar', 'high', 'done', -3],
            ['Thumbnail templates', 'medium', 'done', -2],
            ['Script for next video', 'medium', 'done', -1],
            ['Edit YouTube video', 'high', 'todo', 0],
            ['Plan this week’s content', 'medium', 'todo', 2],
          ],
        },
        {
          name: 'Wise Roots Academy',
          description: 'Website, courses and brand assets.',
          color: 'orange',
          status: 'on-hold',
          tasks: [
            ['Sitemap', 'medium', 'done', -10],
            ['Course outline', 'high', 'todo', 5],
            ['Landing page design', 'high', 'todo', 9],
          ],
        },
        {
          name: 'Son Studio Website',
          description: 'Portfolio site in Framer.',
          color: 'green',
          status: 'done',
          tasks: [
            ['Pick a template', 'low', 'done', -20],
            ['Case studies', 'medium', 'done', -14],
            ['Publish site', 'high', 'done', -12],
          ],
        },
      ];
      samples.forEach((sample, p) => {
        const projectId = this.saveProject(
          {
            name: sample.name,
            description: sample.description,
            status: sample.status,
            color: sample.color,
            startDate: null,
            dueDate: null,
            spaceId: null,
          },
          now + p,
        );
        sample.tasks.forEach(([title, priority, status, due], t) =>
          this.saveTask(
            {
              projectId,
              title,
              description: '',
              priority,
              status,
              dueDate: due === null ? null : day(due),
            },
            now + p * 10 + t,
          ),
        );
      });
    });
    return empty;
  }
}
