import { z } from 'zod';

export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Rect = z.output<typeof rectSchema>;

/**
 * Where everything in a window goes (PLAN.md section 4.6). Computed in main, applied to the
 * web views there, and sent to the shell so it draws chrome in exactly the same places.
 */
export const layoutSchema = z.object({
  sidebar: z.object({ visible: z.boolean(), width: z.number() }),
  /** The rounded content card: toolbar on top, web view below. */
  card: rectSchema,
  toolbar: rectSchema,
  webView: rectSchema,
  /** Every page on screen: one, or two in split view (the first is also card/toolbar/webView). */
  panes: z.array(z.object({ card: rectSchema, toolbar: rectSchema, webView: rectSchema })),
  /** The draggable gap between split panes. */
  divider: rectSchema.nullable(),
  /** Corner radius of the card and web view. */
  radius: z.number(),
  /** A page is in HTML fullscreen: the shell draws nothing over it. */
  fullscreen: z.boolean(),
  /** Library mode (F-11, like Arc): the sections column and the panel beside it; the page moves
   *  over to make room. */
  library: z.object({ nav: rectSchema, panel: rectSchema }).nullable(),
  /** The Notes panel (F-33), docked on the right; the page narrows to make room. */
  notes: rectSchema.nullable(),
  /** Tabs on top (owner request): the tab strip across the window, instead of the sidebar. */
  tabStrip: rectSchema.nullable(),
});
export type Layout = z.output<typeof layoutSchema>;

/** At the minimum, two favorites sit side by side as squares (like Arc's narrowest sidebar). */
export const SIDEBAR_WIDTH = { min: 150, max: 400, default: 260 } as const;

/** Library mode's columns: Arc's narrow sections column, then a panel (wide for Spaces). */
export const LIBRARY_WIDTH = { nav: 116, panel: 300, pageMin: 360 } as const;
export type LibraryPanel = 'narrow' | 'wide';

/** The tab strip's height: the traffic lights (at y 18, 12 tall) sit centred in it. */
export const TAB_STRIP_HEIGHT = 48;

/** The right-hand dock (Notes, Projects, Tasks… or a docked app): its usual width, its width for
 *  the Project Board, the least it shrinks to, the most it can be dragged to, and the page width
 *  it leaves at least. */
export const NOTES_WIDTH = { panel: 380, wide: 720, min: 280, max: 1000, pageMin: 420 } as const;
