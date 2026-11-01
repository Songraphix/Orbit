import { z } from 'zod';

/** An installed extension's toolbar button, for the active tab (site controls grid). */
export const extensionActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** data: URL of its icon, or null. */
  icon: z.string().nullable(),
  title: z.string(),
  badgeText: z.string(),
  badgeColor: z.string().nullable(),
});
export type ExtensionAction = z.output<typeof extensionActionSchema>;
