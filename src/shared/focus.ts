import { z } from 'zod';

/** A focus session (roadmap P2.3): one task (or project), a timer, the sidebar out of the way. */
export const focusSessionSchema = z.object({
  taskId: z.string().nullable(),
  projectId: z.string().nullable(),
  /** What you're focusing on: the task's title, the project's name, or "Focus". */
  title: z.string(),
  startedAt: z.number(),
  minutes: z.number().int().min(1).max(240),
  /** The sidebar was showing when focus began: it comes back after. */
  sidebarWasVisible: z.boolean(),
});
export type FocusSession = z.output<typeof focusSessionSchema>;

export const FOCUS_MINUTES = 25;

/** Time left in ms (negative: over time). Pure. */
export function focusRemaining(session: Pick<FocusSession, 'startedAt' | 'minutes'>, now: number) {
  return session.startedAt + session.minutes * 60_000 - now;
}

/** "24:05", or "+2:10" once over time. Pure. */
export function focusClock(ms: number): string {
  const total = Math.max(0, Math.round(Math.abs(ms) / 1000));
  const clock = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return ms < 0 && total > 0 ? `+${clock}` : clock;
}
