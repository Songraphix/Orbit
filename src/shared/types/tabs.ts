import { z } from 'zod';

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
});
export type TabState = z.output<typeof tabStateSchema>;

export const tabsSnapshotSchema = z.object({
  tabs: z.array(tabStateSchema),
  activeTabId: z.string().nullable(),
});
export type TabsSnapshot = z.output<typeof tabsSnapshotSchema>;

export const NEW_TAB_URL = 'orbit://newtab';
