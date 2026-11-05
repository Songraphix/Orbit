import { z } from 'zod';

/**
 * The Orbit assistant (roadmap P3.1–P3.4): a conversation in the productivity panel. Claude sees
 * what you attach — the page you're on, text you selected, or saved research you picked — and
 * answers cite it. With "Projects and tasks" on (Settings → AI), it can also look at and change
 * your projects and tasks when a question needs it; each thing it does shows in the reply. The conversation lives in memory (it's gone when Orbit quits); answers
 * you want to keep go to Notes.
 */

export const ASSISTANT_LIMITS = { question: 4000, selection: 20_000, captures: 40 } as const;

/** A numbered source an answer cites: a passage of a page, or a saved finding. */
export const assistantSourceSchema = z.object({
  /** The number shown in the answer, from 1. */
  n: z.number().int().min(1),
  kind: z.enum(['page', 'selection', 'research', 'project']),
  /** The page's or the finding's title. */
  title: z.string(),
  host: z.string(),
  /** The cited words. */
  quote: z.string(),
});
export type AssistantSource = z.output<typeof assistantSourceSchema>;

/** A run of answer text and the sources it cites. */
export const assistantPartSchema = z.object({
  text: z.string(),
  cites: z.array(z.number().int().min(1)),
});
export type AssistantPart = z.output<typeof assistantPartSchema>;

/** What a question was sent with, as the conversation shows it ("Page · example.com"). */
export const assistantContextSchema = z.object({
  kind: z.enum(['page', 'selection', 'research', 'project']),
  label: z.string(),
  /** Only the first part of a long page was read. */
  partial: z.boolean(),
});
export type AssistantContext = z.output<typeof assistantContextSchema>;

/** Something Orbit AI did with your projects and tasks while answering (shown in the reply). */
export const assistantActionSchema = z.object({
  /** link: a site Orbit AI suggests but didn't open by itself (the user clicks to open it). */
  kind: z.enum(['read', 'create', 'update', 'focus', 'link']),
  label: z.string(),
  url: z.string().max(2000).optional(),
});
export type AssistantAction = z.output<typeof assistantActionSchema>;

export const ASSISTANT_STATUSES = ['thinking', 'writing', 'done', 'stopped', 'error'] as const;

export const assistantMessageSchema = z.discriminatedUnion('role', [
  z.object({
    id: z.string(),
    role: z.literal('user'),
    text: z.string(),
    context: z.array(assistantContextSchema),
  }),
  z.object({
    id: z.string(),
    role: z.literal('assistant'),
    parts: z.array(assistantPartSchema),
    sources: z.array(assistantSourceSchema),
    status: z.enum(ASSISTANT_STATUSES),
    error: z.string().nullable(),
    /** The model that answered. */
    model: z.string().nullable(),
    /** What it looked at or changed in your projects and tasks, in order. */
    actions: z.array(assistantActionSchema).default([]),
    /** The question was spoken (voice): the panel may read this answer aloud. */
    spoken: z.boolean().default(false),
  }),
]);
export type AssistantMessage = z.output<typeof assistantMessageSchema>;
export type AssistantReply = Extract<AssistantMessage, { role: 'assistant' }>;

/** A task Claude suggested from text, before you add it. */
export const taskSuggestionSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000),
});
export type TaskSuggestion = z.output<typeof taskSuggestionSchema>;

export const assistantStateSchema = z.object({
  messages: z.array(assistantMessageSchema),
  /** An answer is on its way. */
  busy: z.boolean(),
  /** The page you're on (offered to attach; Orbit's own pages can't be). */
  page: z
    .object({
      title: z.string(),
      host: z.string(),
      favicon: z.string().nullable(),
      /** It goes with your next question. */
      attached: z.boolean(),
    })
    .nullable(),
  /** Text you selected and asked about (goes with the next question only). */
  selection: z.object({ text: z.string(), from: z.string() }).nullable(),
  /** Saved research you picked. */
  research: z
    .object({ projectId: z.string().nullable(), label: z.string(), count: z.number().int() })
    .nullable(),
  /** Other open tabs you added (to compare pages; read when you send). */
  tabs: z.array(z.object({ id: z.string(), title: z.string(), host: z.string() })).default([]),
  /** Open tabs you could add. */
  otherTabs: z.array(z.object({ id: z.string(), title: z.string(), host: z.string() })).default([]),
  /** A project you chose to share: its brief, tasks and notes (sent when you ask). */
  project: z.object({ id: z.string(), name: z.string() }).nullable().default(null),
  /** Projects you could share. */
  projects: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  /** Why Claude can't be asked right now (no key, AI off, monthly limit) — or null. */
  blocked: z.string().nullable(),
  /** The model that will answer. */
  model: z.string(),
  /** Orbit AI may look at and change your projects and tasks (Settings → AI). */
  workAccess: z.boolean().default(false),
  /** This conversation uses your projects and tasks (off until you add them; owner request). */
  workOn: z.boolean().default(false),
  /** Tasks Claude suggested, waiting for you to pick and add them. */
  tasks: z
    .object({
      from: z.string(),
      projectId: z.string().nullable(),
      items: z.array(taskSuggestionSchema),
      busy: z.boolean(),
      error: z.string().nullable(),
    })
    .nullable(),
});
export type AssistantState = z.output<typeof assistantStateSchema>;

/** The schema Claude fills when turning text into tasks (structured output: plain types only;
 *  `cleanSuggestions` trims and limits what comes back). */
export const taskExtractionSchema = z.object({
  tasks: z.array(z.object({ title: z.string(), notes: z.string() })),
});

/** Claude's suggestions, tidied: trimmed, no blanks or repeats, at most 20, within limits. */
export function cleanSuggestions(tasks: readonly { title: string; notes: string }[]) {
  const seen = new Set<string>();
  const out: TaskSuggestion[] = [];
  for (const task of tasks) {
    const title = task.title.replace(/\s+/g, ' ').trim().slice(0, 200);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, notes: task.notes.trim().slice(0, 2000) });
    if (out.length === 20) break;
  }
  return out;
}
