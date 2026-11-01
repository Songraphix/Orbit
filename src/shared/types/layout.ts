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
});
export type Layout = z.output<typeof layoutSchema>;

export const SIDEBAR_WIDTH = { min: 200, max: 400, default: 260 } as const;

/** Library mode's columns: Arc's narrow sections column, then a panel (wide for Spaces). */
export const LIBRARY_WIDTH = { nav: 104, panel: 300, pageMin: 360 } as const;
export type LibraryPanel = 'narrow' | 'wide';
