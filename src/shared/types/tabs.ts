import { z } from 'zod';
import { viewportSchema } from '../toolkit/state';

/** What the shell needs to draw one tab (PLAN.md sections 4.7 and F-04). */
export const tabStateSchema = z.object({
  id: z.string(),
  /** The address shown to the user: a web URL, or `orbit://newtab` for internal pages. */
  url: z.string(),
  title: z.string(),
  /** Small favicon as a data: URL (the shell never loads remote images), or null. */
  favicon: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  /** `internal` = an Orbit page such as the new tab page. */
  kind: z.enum(['web', 'internal']),
  /** The page's renderer process died; the shell shows a Reload card instead of the page. */
  crashed: z.boolean(),
  /** The page failed to load (offline, unknown address, refused…): Chromium's net error code
   *  and the address it tried. The shell shows a card with Try Again instead of a blank page. */
  loadError: z.object({ code: z.number().int(), url: z.string() }).nullable().default(null),
  /** The page is a PDF in Chromium's viewer (roadmap R2 M4: PDF Notes, reading it for AI). */
  pdf: z.boolean().default(false),
  /** The site is in Developer Mode (F-30): full URL, DevTools button, error count. */
  devMode: z.boolean(),
  /** Console errors since the page loaded (shown in Developer Mode). */
  consoleErrors: z.number(),
  /** Responsive mode (roadmap P3.6): the device size the page is shown at, or null. */
  viewport: viewportSchema.nullable(),
});
export type TabState = z.output<typeof tabStateSchema>;

export const tabsSnapshotSchema = z.object({
  tabs: z.array(tabStateSchema),
  activeTabId: z.string().nullable(),
  /** Split view (F-13): left and right pane tabs, and the left pane's share of the width. */
  split: z.object({ tabIds: z.tuple([z.string(), z.string()]), ratio: z.number() }).nullable(),
});
export type TabsSnapshot = z.output<typeof tabsSnapshotSchema>;

export const NEW_TAB_URL = 'orbit://newtab';
