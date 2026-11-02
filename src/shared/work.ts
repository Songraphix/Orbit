import { z } from 'zod';
import { captureSchema } from './capture';

/**
 * Projects and tasks (owner request, "Browser Project Management"): the data the productivity
 * panel shows, and the pure rules it follows — progress, counts, filters and due dates.
 */

export const PROJECT_STATUSES = ['active', 'on-hold', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  'on-hold': 'On Hold',
  done: 'Done',
};

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  doing: 'In Progress',
  done: 'Done',
};

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Project colours (folder icons, progress bars). */
export const PROJECT_COLORS = [
  { id: 'purple', hex: '#8b5cf6' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'orange', hex: '#f97316' },
  { id: 'green', hex: '#22c55e' },
  { id: 'pink', hex: '#ec4899' },
  { id: 'teal', hex: '#14b8a6' },
  { id: 'red', hex: '#ef4444' },
  { id: 'yellow', hex: '#eab308' },
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number]['id'];
const colorIds = PROJECT_COLORS.map((c) => c.id) as [ProjectColor, ...ProjectColor[]];

export const colorHex = (id: string): string =>
  PROJECT_COLORS.find((c) => c.id === id)?.hex ?? PROJECT_COLORS[0].hex;

/** A local calendar date, "2026-11-01". */
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(PROJECT_STATUSES),
  color: z.enum(colorIds),
  startDate: dateKeySchema.nullable(),
  dueDate: dateKeySchema.nullable(),
  /** Its workspace: a Space whose tabs belong to the project (null = none). */
  spaceId: z.string().nullable(),
  /** When its page was last opened ("Continue where you left off"). */
  lastOpenedAt: z.number().nullable(),
  /** A GitHub repository it follows, "owner/repo" (roadmap P4.2). */
  githubRepo: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.output<typeof projectSchema>;

export const taskSchema = z.object({
  id: z.string(),
  /** null = not in a project. */
  projectId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  priority: z.enum(PRIORITIES),
  status: z.enum(TASK_STATUSES),
  dueDate: dateKeySchema.nullable(),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Task = z.output<typeof taskSchema>;

export const workDataSchema = z.object({
  projects: z.array(projectSchema),
  tasks: z.array(taskSchema),
  /** Spaces a project can use as its workspace. */
  spaces: z.array(z.object({ id: z.string(), name: z.string(), icon: z.string() })),
  /** Workspace templates a new project's Space can start from (roadmap P2.5). */
  templates: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Findings saved with Orbit Capture (research), newest first. */
  captures: z.array(captureSchema),
  /** Project templates (roadmap P4.1): built in, then yours. */
  projectTemplates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      color: z.string(),
      tasks: z.number().int(),
      builtIn: z.boolean(),
    }),
  ),
  /** Notes that belong to a project. */
  notes: z.array(
    z.object({ id: z.string(), title: z.string(), projectId: z.string(), updatedAt: z.number() }),
  ),
});
export type WorkData = z.output<typeof workDataSchema>;

export const projectInputSchema = z
  .object({
    id: z.string().max(64).optional(),
    name: z.string().max(80),
    description: z.string().max(300),
    status: z.enum(PROJECT_STATUSES),
    color: z.enum(colorIds),
    startDate: dateKeySchema.nullable(),
    dueDate: dateKeySchema.nullable(),
    spaceId: z.string().max(64).nullable(),
    /** Make a new Space for the project and link it. */
    newSpace: z.boolean().optional(),
    /** …from this workspace template (roadmap P2.5). */
    templateId: z.string().max(64).optional(),
    /** A GitHub repository to follow, "owner/repo" (roadmap P4.2). */
    githubRepo: z.string().max(140).nullable().optional(),
    /** A new project's starting tasks: a built-in or saved project template (roadmap P4.1). */
    projectTemplate: z.string().max(64).optional(),
  })
  .strict();
export type ProjectInput = z.output<typeof projectInputSchema>;

export const taskInputSchema = z
  .object({
    id: z.string().max(64).optional(),
    projectId: z.string().max(64).nullable(),
    title: z.string().max(200),
    description: z.string().max(2000),
    priority: z.enum(PRIORITIES),
    status: z.enum(TASK_STATUSES),
    dueDate: dateKeySchema.nullable(),
    /** Made from this finding (Research → Make Task): they're linked. */
    captureId: z.string().max(64).optional(),
  })
  .strict();
export type TaskInput = z.output<typeof taskInputSchema>;

/** Why a project can't be saved, or null. Pure. */
export function projectProblem(input: Pick<ProjectInput, 'name' | 'startDate' | 'dueDate'>) {
  if (!input.name.trim()) return 'Give the project a name';
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    return 'The due date is before the start date';
  }
  return null;
}

/** Why a task can't be saved, or null. Pure. */
export function taskProblem(input: Pick<TaskInput, 'title'>) {
  return input.title.trim() ? null : 'Give the task a title';
}

export type Progress = { total: number; done: number; remaining: number; percent: number };

/** A project's progress, from its tasks only: done / total, rounded; 0 % with no tasks. Pure. */
export function projectProgress(projectId: string, tasks: readonly Task[]): Progress {
  const mine = tasks.filter((t) => t.projectId === projectId);
  const done = mine.filter((t) => t.status === 'done').length;
  const total = mine.length;
  return {
    total,
    done,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export type ProjectFilter = 'all' | ProjectStatus;

/** How many projects each filter shows. Pure. */
export function projectCounts(projects: readonly Project[]): Record<ProjectFilter, number> {
  return {
    all: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    'on-hold': projects.filter((p) => p.status === 'on-hold').length,
    done: projects.filter((p) => p.status === 'done').length,
  };
}

export function filterProjects(projects: readonly Project[], filter: ProjectFilter): Project[] {
  return filter === 'all' ? [...projects] : projects.filter((p) => p.status === filter);
}

/** Today's local date as "YYYY-MM-DD". */
export function dateKey(at: Date | number): string {
  const d = typeof at === 'number' ? new Date(at) : at;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type TaskFilter = 'all' | 'today' | 'upcoming' | 'completed';

/**
 * The Tasks tab's filters (local dates): All — everything, open first; Today — open tasks due
 * today or overdue; Upcoming — open tasks due later; Completed — done, newest first. Pure.
 */
export function filterTasks(tasks: readonly Task[], filter: TaskFilter, today: string): Task[] {
  const open = tasks.filter((t) => t.status !== 'done');
  const byDue = (a: Task, b: Task) =>
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt - b.createdAt;
  switch (filter) {
    case 'today':
      return open.filter((t) => t.dueDate !== null && t.dueDate <= today).sort(byDue);
    case 'upcoming':
      return open.filter((t) => t.dueDate !== null && t.dueDate > today).sort(byDue);
    case 'completed':
      return tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    default:
      return [...open.sort(byDue), ...tasks.filter((t) => t.status === 'done')];
  }
}

/**
 * Today's list (the new tab page's, in step with Tasks → Today): open tasks due today or
 * overdue, then the ones ticked off today (struck through, so the day's progress shows). Pure.
 */
export function todayTasks(tasks: readonly Task[], today: string): Task[] {
  const done = tasks
    .filter(
      (t) =>
        t.status === 'done' &&
        t.dueDate !== null &&
        t.dueDate <= today &&
        t.completedAt !== null &&
        dateKey(t.completedAt) === today,
    )
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  return [...filterTasks(tasks, 'today', today), ...done];
}

export function taskCounts(tasks: readonly Task[], today: string): Record<TaskFilter, number> {
  return {
    all: tasks.length,
    today: filterTasks(tasks, 'today', today).length,
    upcoming: filterTasks(tasks, 'upcoming', today).length,
    completed: filterTasks(tasks, 'completed', today).length,
  };
}

/** "Today", "Tomorrow", "Overdue · 30 Oct", "4 Nov". Pure (dates are local "YYYY-MM-DD"). */
export function dueLabel(
  due: string,
  today: string,
  done = false,
): { text: string; overdue: boolean } {
  const [y, m, d] = due.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const short = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (due === today) return { text: 'Today', overdue: false };
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const days = Math.round((date.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (days === 1) return { text: 'Tomorrow', overdue: false };
  if (days < 0 && !done) return { text: `Overdue · ${short}`, overdue: true };
  return { text: short, overdue: false };
}

/**
 * "Continue where you left off": the open project looked at most recently, with its next open
 * task (earliest due first). Null when nothing has been opened, or everything is done. Pure.
 */
export function continueWith(
  projects: readonly Project[],
  tasks: readonly Task[],
): { project: Project; next: Task | null } | null {
  const project = projects
    .filter((p) => p.lastOpenedAt !== null && p.status !== 'done')
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0];
  if (!project) return null;
  const open = tasks.filter((t) => t.projectId === project.id && t.status !== 'done');
  const next =
    open.sort(
      (a, b) =>
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
        (a.status === 'doing' ? -1 : 0) - (b.status === 'doing' ? -1 : 0) ||
        a.createdAt - b.createdAt,
    )[0] ?? null;
  return { project, next };
}
