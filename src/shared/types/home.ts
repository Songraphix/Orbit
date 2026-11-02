import { z } from 'zod';

/** The new tab page's look and which widgets it shows (owner request). */
export const homeSettingsSchema = z.object({
  /** Dark glass (default) or light glass for the widgets. */
  theme: z.enum(['dark', 'light']),
  tagline: z.string().max(80),
  show: z.object({ shortcuts: z.boolean(), today: z.boolean(), quote: z.boolean() }),
});
export type HomeSettings = z.output<typeof homeSettingsSchema>;

export const DEFAULT_HOME: HomeSettings = {
  theme: 'dark',
  tagline: 'Focus. Create. Build. Repeat.',
  show: { shortcuts: true, today: true, quote: true },
};

export const shortcutSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  /** A data: URL, or null for a letter tile. */
  icon: z.string().nullable(),
});
export type Shortcut = z.output<typeof shortcutSchema>;

export const todoSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
  /** The task's project, or "Overdue" (the new tab page's Today list shows real tasks). */
  note: z.string().default(''),
  overdue: z.boolean().default(false),
});
export type Todo = z.output<typeof todoSchema>;

export const MAX_SHORTCUTS = 10;
