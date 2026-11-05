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
  /** The sidebar island (null rect when hidden); `width` is its width as set. */
  sidebar: z.object({ visible: z.boolean(), width: z.number(), rect: rectSchema.nullable() }),
  /** The app rail (UI spec §7, UI 1 and UI 3): pinned apps in a narrow island on the far left. */
  rail: rectSchema.nullable(),
  /** The toolbar row on the canvas (UI spec §5): the Orbit menu, back / forward / reload, the
   *  address, the page's actions and the tools on the right. With tabs on top it's the second
   *  row, over the page. */
  toolbar: rectSchema,
  /** The first page's card and web view (also panes[0]). */
  card: rectSchema,
  webView: rectSchema,
  /** Every page on screen: one, or two in split view (each with a slim header then). */
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
  /** The right-hand dock (Notes, the assistant… or a docked app); the page narrows. */
  notes: rectSchema.nullable(),
  /** A pinned app open beside the rail (UI spec §8, UI 3); the page narrows. */
  appDock: rectSchema.nullable(),
  /** …or floating over the page (unpinned): the page keeps its width. */
  appDockFloat: z.boolean().default(false),
  /** The app rail is tucked away (auto-hide): it slides out from the window's left edge. */
  railHidden: z.boolean().default(false),
  /** Tabs on top: the row of tab pills across the window's top. */
  tabStrip: rectSchema.nullable(),
});
export type Layout = z.output<typeof layoutSchema>;

/** At the minimum, two favorites sit side by side as squares (like Arc's narrowest sidebar). */
export const SIDEBAR_WIDTH = { min: 150, max: 400, default: 236 } as const;

/** Library mode's columns: Arc's narrow sections column, then a panel (wide for Spaces). */
export const LIBRARY_WIDTH = { nav: 116, panel: 300, pageMin: 360 } as const;
export type LibraryPanel = 'narrow' | 'wide';

/** The top row's height: the traffic lights (at y 20, 12 tall) sit centred in it. */
export const TAB_STRIP_HEIGHT = 52;
/** With tabs on top, the second row (back / forward / reload and the address) over the page. */
export const ADDRESS_ROW_HEIGHT = 46;
/** The app rail's width. */
export const RAIL_WIDTH = 60;
/** A split pane's slim header (its page's title, swap, close split). */
export const PANE_HEADER_HEIGHT = 32;

/** The right-hand dock (Notes, Projects, Tasks… or a docked app): its usual width, its width for
 *  the Project Board, the least it shrinks to, the most it can be dragged to, and the page width
 *  it leaves at least. */
export const NOTES_WIDTH = { panel: 380, wide: 720, min: 280, max: 1000, pageMin: 420 } as const;
