import { z } from 'zod';

/**
 * Project templates (roadmap P4.1): a new project can start with the tasks a kind of work
 * usually needs — design, development, research — or from one of your own projects saved as a
 * template. Task due dates are kept as days after the project starts. Pure.
 */

export const templateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  priority: z.enum(['low', 'medium', 'high']),
  /** Days after the project's start (or creation) it's due; null = no due date. */
  dueIn: z.number().int().min(0).max(3650).nullable(),
});
export type TemplateTask = z.output<typeof templateTaskSchema>;

export const projectTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  tasks: z.array(templateTaskSchema),
  builtIn: z.boolean(),
});
export type ProjectTemplate = z.output<typeof projectTemplateSchema>;

const task = (
  title: string,
  priority: TemplateTask['priority'],
  dueIn: number | null,
  description = '',
): TemplateTask => ({ title, priority, dueIn, description });

export const BUILT_IN_PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'builtin:design',
    name: 'Design project',
    description: 'From brief to delivered assets.',
    color: 'pink',
    builtIn: true,
    tasks: [
      task('Write the brief: goals, audience, constraints', 'high', 1),
      task('Collect references and a moodboard', 'medium', 3),
      task('Sketch first concepts', 'high', 5),
      task('Review concepts and gather feedback', 'medium', 7),
      task('Refine the chosen direction', 'high', 10),
      task('Check contrast, sizes and accessibility', 'medium', 12),
      task('Export and hand off final assets', 'high', 14),
    ],
  },
  {
    id: 'builtin:development',
    name: 'Development project',
    description: 'Plan, build, review and ship.',
    color: 'blue',
    builtIn: true,
    tasks: [
      task('Set up the repository and local environment', 'high', 1),
      task('Write down scope and milestones', 'high', 2),
      task('Build the first feature end to end', 'high', 7),
      task('Add tests for the critical paths', 'medium', 9),
      task('Review open pull requests', 'medium', 10),
      task('Test on real devices and browsers', 'medium', 12),
      task('Release and write the changelog', 'high', 14),
    ],
  },
  {
    id: 'builtin:research',
    name: 'Research project',
    description: 'Questions, sources, findings.',
    color: 'green',
    builtIn: true,
    tasks: [
      task('Define the questions to answer', 'high', 1),
      task('Collect sources and save findings with ⇧⌘S', 'medium', 4),
      task('Summarize what the sources agree and disagree on', 'medium', 7),
      task('Draft conclusions and open questions', 'high', 9),
      task('Share the findings', 'medium', 10),
    ],
  },
];

/** A day key 'YYYY-MM-DD', `days` after `start` (a day key) — local calendar days. */
export function addDays(start: string, days: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `from` to `to` (day keys); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const toTime = (key: string) => {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toTime(to) - toTime(from)) / 86_400_000);
}

/** A project's tasks as a template: titles, notes, priorities, due dates as days from `start`. */
export function tasksAsTemplate(
  tasks: readonly {
    title: string;
    description: string;
    priority: TemplateTask['priority'];
    dueDate: string | null;
  }[],
  start: string,
): TemplateTask[] {
  return tasks.slice(0, 100).map((t) => ({
    title: t.title.slice(0, 200),
    description: t.description.slice(0, 2000),
    priority: t.priority,
    dueIn: t.dueDate ? Math.max(0, daysBetween(start, t.dueDate)) : null,
  }));
}
