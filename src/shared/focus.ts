import { z } from 'zod';
import { soundIdSchema, soundStateSchema } from './sounds';

/**
 * A focus session (roadmap P2.3): a task (or project, or just time), a timer, the sidebar out
 * of the way — and optionally a sound and distracting sites blocked. A break is a session too.
 * Fields added later have defaults, so a session saved by an older Orbit still reads.
 */
export const focusSessionSchema = z.object({
  taskId: z.string().nullable(),
  projectId: z.string().nullable(),
  /** What you're focusing on: the task's title, the project's name, "Focus" or "Break". */
  title: z.string(),
  startedAt: z.number(),
  minutes: z.number().int().min(1).max(240),
  /** The sidebar was showing when focus began: it comes back after. */
  sidebarWasVisible: z.boolean(),
  kind: z.enum(['focus', 'break']).default('focus'),
  /** Paused since (null: running). */
  pausedAt: z.number().nullable().default(null),
  /** Time spent paused before the current pause, in ms. */
  pausedMs: z.number().min(0).default(0),
  /** Distracting sites are blocked until it ends. */
  block: z.boolean().default(false),
  /** Sites you chose to open anyway this session. */
  allowed: z.array(z.string().max(253)).max(50).default([]),
  /** The sound started with it (stopped when it ends). */
  sound: soundIdSchema.nullable().default(null),
});
export type FocusSession = z.output<typeof focusSessionSchema>;

/** How you like to focus: kept between sessions (Settings key 'focus.prefs'). */
const focusPrefFields = {
  minutes: z.number().int().min(1).max(240),
  breakMinutes: z.number().int().min(1).max(60),
  block: z.boolean(),
  blocklist: z.array(z.string().min(1).max(253)).max(100),
  sound: soundIdSchema.nullable(),
  /** A macOS notification when time's up (brief M7). */
  notify: z.boolean(),
  /** A soft bowl chime when time's up. */
  chime: z.boolean(),
};
export const focusPrefsSchema = z.object({
  ...focusPrefFields,
  notify: focusPrefFields.notify.default(true),
  chime: focusPrefFields.chime.default(true),
});
/** A change to some of them (not .partial(): zod 4 would fill in the defaults). */
export const focusPrefsPatchSchema = z.object(focusPrefFields).partial().strict();
export type FocusPrefs = z.output<typeof focusPrefsSchema>;

export const FOCUS_MINUTES = 25;
export const FOCUS_DURATIONS = [15, 25, 50, 90] as const;

export const DEFAULT_BLOCKLIST = [
  'youtube.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'netflix.com',
];

export const DEFAULT_FOCUS_PREFS: FocusPrefs = {
  minutes: FOCUS_MINUTES,
  breakMinutes: 5,
  block: false,
  blocklist: DEFAULT_BLOCKLIST,
  sound: null,
  notify: true,
  chime: true,
};

/** Time left in ms (negative: over time); a pause stops the clock. Pure. */
export function focusRemaining(
  session: Pick<FocusSession, 'startedAt' | 'minutes'> &
    Partial<Pick<FocusSession, 'pausedAt' | 'pausedMs'>>,
  now: number,
) {
  const paused = (session.pausedMs ?? 0) + (session.pausedAt ? now - session.pausedAt : 0);
  return session.startedAt + session.minutes * 60_000 + paused - now;
}

/** "24:05", or "+2:10" once over time. Pure. */
export function focusClock(ms: number): string {
  const total = Math.max(0, Math.round(Math.abs(ms) / 1000));
  const clock = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return ms < 0 && total > 0 ? `+${clock}` : clock;
}

/** How far through (0–1, capped). Pure. */
export function focusProgress(session: FocusSession, now: number): number {
  const total = session.minutes * 60_000;
  return Math.min(1, Math.max(0, 1 - focusRemaining(session, now) / total));
}

/** "www.YouTube.com/", "https://youtube.com/x" → "youtube.com"; null if it isn't a site. Pure. */
export function normalizeSite(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** The blocked site `url` belongs to (the site or any subdomain), or null. Pure. */
export function blockedSite(
  url: string,
  blocklist: readonly string[],
  allowed: readonly string[] = [],
): string | null {
  let host: string;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  const matches = (site: string) => host === site || host.endsWith(`.${site}`);
  if (allowed.some(matches)) return null;
  return blocklist.find(matches) ?? null;
}

/** The panel's Focus view: the session, your preferences and the sound. */
export const focusViewSchema = z.object({
  session: focusSessionSchema.nullable(),
  prefs: focusPrefsSchema,
  sounds: soundStateSchema,
  /** Time focused today, sessions today, and the last 7 days (ms, oldest first). */
  history: z
    .object({ todayMs: z.number(), todaySessions: z.number(), week: z.array(z.number()) })
    .default({ todayMs: 0, todaySessions: 0, week: [0, 0, 0, 0, 0, 0, 0] }),
});

/** "1h 25m", "40m", "0m". Pure. */
export function focusTotal(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

/** Time actually focused in a session so far (pauses don't count). Pure. */
export function focusedMs(session: FocusSession, now: number): number {
  const paused = session.pausedMs + (session.pausedAt ? now - session.pausedAt : 0);
  return Math.max(0, now - session.startedAt - paused);
}
export type FocusView = z.output<typeof focusViewSchema>;
