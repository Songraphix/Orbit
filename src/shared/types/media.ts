import { z } from 'zod';

/** The sidebar mini player (F-09, Img 1): what's playing in a tab you're not looking at. */
export const mediaStateSchema = z
  .object({
    tabId: z.string(),
    title: z.string(),
    favicon: z.string().nullable(),
    playing: z.boolean(),
    muted: z.boolean(),
    hasVideo: z.boolean(),
    /** The site offers previous / next track (its media session), like a music player. */
    canPrevious: z.boolean().default(false),
    canNext: z.boolean().default(false),
  })
  .nullable();
export type MediaState = z.output<typeof mediaStateSchema>;

/** The video pop-out's controls (owner request): what its small page shows over the video. */
export const popoutViewSchema = z.object({
  title: z.string(),
  playing: z.boolean(),
  /** The pointer is over the pop-out: the buttons show. */
  hover: z.boolean(),
});
export type PopoutView = z.output<typeof popoutViewSchema>;

export const POPOUT_ACTIONS = ['minimize', 'back', 'close', 'toggle'] as const;
export type PopoutAction = (typeof POPOUT_ACTIONS)[number];
