import { z } from 'zod';

/** Find-in-page state for one window (F-31). The find bar lives in the toolbar strip. */
export const findStateSchema = z.object({
  open: z.boolean(),
  query: z.string(),
  /** 1-based index of the highlighted match, 0 when there are none. */
  activeMatch: z.number().int().min(0),
  matches: z.number().int().min(0),
  /** Bumped each time ⌘F is pressed, so the input re-focuses and selects. */
  focusToken: z.number(),
});
export type FindState = z.output<typeof findStateSchema>;

export const CLOSED_FIND: FindState = {
  open: false,
  query: '',
  activeMatch: 0,
  matches: 0,
  focusToken: 0,
};
