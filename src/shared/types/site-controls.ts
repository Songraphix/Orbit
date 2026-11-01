import { z } from 'zod';
import { boostSummarySchema } from './boosts';
import { extensionActionSchema } from './extensions';
import { rectSchema } from './layout';

export const siteSettingRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  icon: z.enum(['bell', 'preview', 'hammer', 'camera', 'mic', 'location']),
  value: z.string(),
  valueLabel: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
});
export type SiteSettingRow = z.output<typeof siteSettingRowSchema>;

/** The site controls popover (F-12, Img 3) for the active tab's site. */
export const siteControlsViewSchema = z.object({
  /** The toolbar button it hangs from, in window coordinates. */
  anchor: rectSchema,
  url: z.string(),
  host: z.string(),
  secure: z.boolean(),
  settings: z.array(siteSettingRowSchema),
  /** Installed extensions' buttons for this tab. */
  extensions: z.array(extensionActionSchema),
  /** On a Chrome Web Store page: that extension, and whether Orbit has it. */
  storeExtension: z.object({ id: z.string(), installed: z.boolean() }).nullable(),
  /** Boosts for this site, on or off. */
  boosts: z.array(boostSummarySchema),
  openedAt: z.number(),
});
export type SiteControlsView = z.output<typeof siteControlsViewSchema>;

/** `boost` makes a new Boost for the site; `zap` starts hiding elements on it. */
export const siteActionSchema = z.enum(['share', 'boost', 'zap', 'screenshot', 'copyUrl', 'more']);
export type SiteAction = z.output<typeof siteActionSchema>;
