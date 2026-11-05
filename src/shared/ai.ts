import { z } from 'zod';

/**
 * Orbit's AI settings and usage (roadmap P3.7): which Claude model answers, a monthly spending
 * limit, whether the page you're on is attached for you, and a log of what was sent — kept on
 * this Mac, metadata only (never the page text or your question). Pure.
 */

/** Prices are US dollars per million tokens (Anthropic's list prices, used for estimates). */
export const AI_MODELS = [
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    blurb: 'Most capable — the best answers',
    input: 4,
    output: 20,
    cacheRead: 0.2,
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    blurb: 'Fast and capable',
    input: 2,
    output: 10,
    cacheRead: 0.2,
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    blurb: 'Fastest, lowest cost',
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
  },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]['id'];
export const aiModelIdSchema = z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);

/** Another model answered (a server-side fallback): price it like a larger one, to be safe. */
const UNKNOWN_PRICES = { input: 5, output: 25, cacheRead: 0.5 } as const;

export const aiPrefsSchema = z.object({
  /** Off: no AI feature sends anything (the key stays saved). */
  enabled: z.boolean(),
  model: aiModelIdSchema,
  /** Stop sending once this month's estimated spend reaches this many dollars (null: no limit). */
  monthlyBudget: z.number().min(0.5).max(1000).nullable(),
  /** Attach the page you're on whenever the assistant opens (otherwise you add it yourself). */
  attachPage: z.boolean(),
  /** Orbit AI may look at and change your projects and tasks when a question needs it. */
  workAccess: z.boolean().default(true),
  /** …your open tabs and apps, and open sites, search, switch tabs and open apps for you. */
  browserAccess: z.boolean().default(true),
  /** …search the pages you've visited (off until you allow it). */
  historyAccess: z.boolean().default(false),
  /** …find, read, open and write your notes. */
  notesAccess: z.boolean().default(true),
  /** …search and read your Google Drive (when it's connected; read-only). */
  driveAccess: z.boolean().default(true),
});
export type AiPrefs = z.output<typeof aiPrefsSchema>;

/** A change to some AI preferences. (Not aiPrefsSchema.partial(): zod 4 keeps `.default()`
 *  inside optional fields, so a patch would switch workAccess back on.) */
export const aiPrefsPatchSchema = aiPrefsSchema
  .extend({
    workAccess: z.boolean(),
    browserAccess: z.boolean(),
    historyAccess: z.boolean(),
    notesAccess: z.boolean(),
    driveAccess: z.boolean(),
  })
  .partial()
  .strict();

export const DEFAULT_AI_PREFS: AiPrefs = {
  enabled: true,
  model: 'claude-opus-5-5',
  monthlyBudget: 10,
  attachPage: false,
  workAccess: true,
  browserAccess: true,
  historyAccess: false,
  notesAccess: true,
  driveAccess: true,
};

/** What each request was for, in the activity log. */
export const AI_FEATURES = ['assistant', 'summary', 'tasks', 'research', 'tidy'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  assistant: 'Question',
  summary: 'Summary',
  tasks: 'Tasks from text',
  research: 'Question about research',
  tidy: 'Tidy tabs',
};

export const aiActivitySchema = z.object({
  id: z.string(),
  at: z.number(),
  feature: z.enum(AI_FEATURES),
  /** The model that answered. */
  model: z.string().max(80),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  /** Estimated cost in US dollars. */
  cost: z.number().min(0),
  /** What was sent, described: "Page “Title” (example.com) and your question". */
  sent: z.string().max(400),
});
export type AiActivity = z.output<typeof aiActivitySchema>;

export const aiUsageSchema = z.object({
  /** The calendar month, 'YYYY-MM' (local time). */
  month: z.string(),
  requests: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cost: z.number().min(0),
});
export type AiUsage = z.output<typeof aiUsageSchema>;

/** Token counts as the Messages API reports them. */
export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** The estimated cost of one response in US dollars (cache writes cost 1.25× input). */
export function estimateCost(model: string, usage: TokenUsage): number {
  const prices = AI_MODELS.find((m) => m.id === model) ?? UNKNOWN_PRICES;
  const written = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  return (
    (usage.input_tokens * prices.input +
      written * prices.input * 1.25 +
      read * prices.cacheRead +
      usage.output_tokens * prices.output) /
    1_000_000
  );
}

/** All input tokens of a response, cached or not. */
export const inputTokens = (usage: TokenUsage): number =>
  usage.input_tokens +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0);

/** 'YYYY-MM' for a time, in local time. */
export function monthKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The first moment of `at`'s month (local time). */
export function monthStart(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Dollars, the way Settings shows them: "$0.004", "$0.12", "$3.40". */
export function formatCost(dollars: number): string {
  if (dollars === 0) return '$0';
  if (dollars < 0.001) return '<$0.001';
  if (dollars < 0.01) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

/** Whether a new request may go: under the monthly limit (or no limit). */
export function withinBudget(prefs: AiPrefs, spentThisMonth: number): boolean {
  return prefs.monthlyBudget === null || spentThisMonth < prefs.monthlyBudget;
}
