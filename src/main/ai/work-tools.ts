import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import {
  PRIORITIES,
  PROJECT_COLORS,
  PROJECT_STATUSES,
  TASK_STATUSES,
  dateKey,
  dateKeySchema,
  filterTasks,
  projectProgress,
} from '@shared/work';
import type { Project, Task } from '@shared/work';
import type { AssistantAction } from '@shared/assistant';
import type { WorkRepository } from '../persistence/repositories/work';

/**
 * Orbit AI as a coworker (owner request): tools Claude can call to read and change your
 * projects and tasks. They run here, against your data, only when Claude asks during a reply,
 * and each one shows in the conversation ("Created task …"). Nothing is ever deleted — Claude
 * can mark things done or move them, and says to delete in the panel.
 */

const colorIds = PROJECT_COLORS.map((c) => c.id) as [string, ...string[]];
const ids = z.string().min(1).max(64);
const date = dateKeySchema.describe('A date as YYYY-MM-DD');

const inputs = {
  list_projects: z.object({
    status: z.enum([...PROJECT_STATUSES, 'all']).optional(),
  }),
  list_tasks: z.object({
    filter: z.enum(['today', 'upcoming', 'open', 'completed', 'all']).optional(),
    project_id: ids.optional(),
    query: z.string().max(200).optional(),
  }),
  create_task: z.object({
    title: z.string().min(1).max(200),
    project_id: ids.nullable().optional(),
    description: z.string().max(2000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    due_date: date.nullable().optional(),
  }),
  update_task: z.object({
    task_id: ids,
    title: z.string().min(1).max(200).optional(),
    project_id: ids.nullable().optional(),
    description: z.string().max(2000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    due_date: date.nullable().optional(),
  }),
  create_project: z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(300).optional(),
    color: z.enum(colorIds).optional(),
    start_date: date.nullable().optional(),
    due_date: date.nullable().optional(),
    tasks: z.array(z.string().min(1).max(200)).max(30).optional(),
  }),
  update_project: z.object({
    project_id: ids,
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(300).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    color: z.enum(colorIds).optional(),
    due_date: date.nullable().optional(),
  }),
  start_focus: z.object({
    task_id: ids.nullable().optional(),
    minutes: z.number().int().min(5).max(180).optional(),
  }),
} as const;
export type WorkToolName = keyof typeof inputs;

const DESCRIPTIONS: Record<WorkToolName, string> = {
  list_projects:
    'List the user’s projects in Orbit with status, dates and task progress. Use before answering questions about projects or before changing one.',
  list_tasks:
    'List the user’s tasks. filter: today (due today or overdue, open), upcoming (due later), open (all not done), completed, all. Optionally only one project’s, or those whose title or notes contain query.',
  create_task:
    'Add a task. Put it in a project when it clearly belongs to one (get project ids from list_projects). due_date is a local date YYYY-MM-DD; status defaults to todo, priority to medium.',
  update_task:
    'Change a task: title, notes, priority, status (todo, doing, done), due date (null clears it) or project (null: no project). Mark done with status "done".',
  create_project:
    'Create a project, optionally with starting tasks (titles). Use when the user asks for a new project or a plan that deserves one.',
  update_project:
    'Change a project: name, description, status (active, on-hold, done), colour or due date.',
  start_focus:
    'Start a focus session in Orbit (a timer; the sidebar steps aside), on a task or just time. Only when the user asks to focus or start working.',
};

/** The JSON Schemas Claude sees (derived from the same zod schemas used to check inputs). */
export function workTools(): BetaToolUnion[] {
  return (Object.keys(inputs) as WorkToolName[]).map((name) => {
    const { $schema: _, ...schema } = z.toJSONSchema(inputs[name], {
      target: 'draft-7',
    }) as Record<string, unknown>;
    return {
      name,
      description: DESCRIPTIONS[name],
      input_schema: schema as { type: 'object'; [key: string]: unknown },
      // Inputs stream as they're written; each is checked against its schema before it runs.
      eager_input_streaming: true,
    };
  });
}

export type ToolOutcome = {
  /** What goes back to Claude (JSON). */
  content: string;
  isError: boolean;
  /** What the conversation shows (none for an error). */
  action: AssistantAction | null;
  /** Projects or tasks changed (the panel refreshes). */
  changed: boolean;
};

export type WorkToolDeps = {
  work: WorkRepository;
  /** Starts a focus session in the asking window. */
  startFocus: (input: { taskId: string | null; minutes?: number }) => void;
  now?: () => number;
};

const taskView = (t: Task, projects: readonly Project[]) => ({
  id: t.id,
  title: t.title,
  project: projects.find((p) => p.id === t.projectId)?.name ?? null,
  project_id: t.projectId,
  status: t.status,
  priority: t.priority,
  due_date: t.dueDate,
  ...(t.description ? { notes: t.description.slice(0, 400) } : {}),
});

const error = (message: string): ToolOutcome => ({
  content: JSON.stringify({ error: message }),
  isError: true,
  action: null,
  changed: false,
});
const ok = (result: unknown, action: AssistantAction | null, changed = false): ToolOutcome => ({
  content: JSON.stringify(result),
  isError: false,
  action,
  changed,
});

/** Runs one tool call. Inputs are untrusted model output: each is checked against its schema. */
export function runWorkTool(name: string, input: unknown, deps: WorkToolDeps): ToolOutcome {
  if (!(name in inputs)) return error(`Unknown tool ${name}`);
  const parsed = inputs[name as WorkToolName].safeParse(input);
  if (!parsed.success) {
    return error(`Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const { work } = deps;
  const today = dateKey(new Date(deps.now?.() ?? Date.now()));
  const { projects, tasks } = work.all();
  const projectOf = (id: string | null | undefined) =>
    id ? (projects.find((p) => p.id === id) ?? null) : null;
  try {
    switch (name as WorkToolName) {
      case 'list_projects': {
        const { status = 'all' } = parsed.data as z.output<typeof inputs.list_projects>;
        const list = projects.filter((p) => status === 'all' || p.status === status);
        return ok(
          {
            today,
            projects: list.map((p) => {
              const progress = projectProgress(p.id, tasks);
              return {
                id: p.id,
                name: p.name,
                description: p.description,
                status: p.status,
                start_date: p.startDate,
                due_date: p.dueDate,
                tasks_done: progress.done,
                tasks_total: progress.total,
              };
            }),
          },
          { kind: 'read', label: `Looked at your projects (${list.length})` },
        );
      }
      case 'list_tasks': {
        const {
          filter = 'open',
          project_id,
          query,
        } = parsed.data as z.output<typeof inputs.list_tasks>;
        const base =
          filter === 'open'
            ? tasks.filter((t) => t.status !== 'done')
            : filterTasks(tasks, filter, today);
        const q = query?.toLowerCase();
        const list = base
          .filter((t) => !project_id || t.projectId === project_id)
          .filter(
            (t) =>
              !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
          )
          .slice(0, 200);
        const where = project_id ? ` in ${projectOf(project_id)?.name ?? 'a project'}` : '';
        const which = {
          today: 'today’s tasks',
          upcoming: 'upcoming tasks',
          open: 'your open tasks',
          completed: 'completed tasks',
          all: 'all your tasks',
        }[filter];
        return ok(
          { today, tasks: list.map((t) => taskView(t, projects)) },
          { kind: 'read', label: `Looked at ${which}${where} (${list.length})` },
        );
      }
      case 'create_task': {
        const i = parsed.data as z.output<typeof inputs.create_task>;
        const project = projectOf(i.project_id);
        if (i.project_id && !project) return error('No project with that id');
        const id = work.saveTask({
          projectId: project?.id ?? null,
          title: i.title,
          description: i.description ?? '',
          priority: i.priority ?? 'medium',
          status: i.status ?? 'todo',
          dueDate: i.due_date ?? null,
        });
        return ok(
          { created: taskView(work.task(id)!, projects) },
          { kind: 'create', label: `Added “${i.title}”${project ? ` to ${project.name}` : ''}` },
          true,
        );
      }
      case 'update_task': {
        const i = parsed.data as z.output<typeof inputs.update_task>;
        const task = work.task(i.task_id);
        if (!task) return error('No task with that id');
        if (i.project_id && !projectOf(i.project_id)) return error('No project with that id');
        work.saveTask({
          id: task.id,
          projectId: i.project_id === undefined ? task.projectId : i.project_id,
          title: i.title ?? task.title,
          description: i.description ?? task.description,
          priority: i.priority ?? task.priority,
          status: i.status ?? task.status,
          dueDate: i.due_date === undefined ? task.dueDate : i.due_date,
        });
        const label =
          i.status === 'done' && task.status !== 'done'
            ? `Marked “${task.title}” done`
            : `Updated “${i.title ?? task.title}”`;
        return ok(
          { updated: taskView(work.task(task.id)!, projects) },
          { kind: 'update', label },
          true,
        );
      }
      case 'create_project': {
        const i = parsed.data as z.output<typeof inputs.create_project>;
        const id = work.saveProject({
          name: i.name,
          description: i.description ?? '',
          status: 'active',
          color: (i.color ?? 'purple') as Project['color'],
          startDate: i.start_date ?? null,
          dueDate: i.due_date ?? null,
          spaceId: null,
        });
        for (const title of i.tasks ?? []) {
          work.saveTask({
            projectId: id,
            title,
            description: '',
            priority: 'medium',
            status: 'todo',
            dueDate: null,
          });
        }
        const n = i.tasks?.length ?? 0;
        return ok(
          { created: { id, name: i.name, tasks: n } },
          {
            kind: 'create',
            label: `Created project “${i.name}”${n ? ` with ${n} task${n === 1 ? '' : 's'}` : ''}`,
          },
          true,
        );
      }
      case 'update_project': {
        const i = parsed.data as z.output<typeof inputs.update_project>;
        const project = projectOf(i.project_id);
        if (!project) return error('No project with that id');
        work.saveProject({
          id: project.id,
          name: i.name ?? project.name,
          description: i.description ?? project.description,
          status: i.status ?? project.status,
          color: (i.color ?? project.color) as Project['color'],
          startDate: project.startDate,
          dueDate: i.due_date === undefined ? project.dueDate : i.due_date,
          spaceId: project.spaceId,
        });
        return ok(
          { updated: { id: project.id, name: i.name ?? project.name } },
          { kind: 'update', label: `Updated project “${i.name ?? project.name}”` },
          true,
        );
      }
      case 'start_focus': {
        const i = parsed.data as z.output<typeof inputs.start_focus>;
        const task = i.task_id ? work.task(i.task_id) : null;
        if (i.task_id && !task) return error('No task with that id');
        deps.startFocus({ taskId: task?.id ?? null, minutes: i.minutes });
        return ok(
          { started: true },
          { kind: 'focus', label: `Started focus${task ? ` on “${task.title}”` : ''}` },
          true,
        );
      }
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e));
  }
}
