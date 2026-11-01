import { z } from 'zod';

/** One row in the command bar (F-21). Main builds and ranks these; the overlay just draws them. */
export const commandItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['navigate', 'search', 'tab', 'history', 'suggestion', 'command']),
  title: z.string(),
  subtitle: z.string(),
  favicon: z.string().nullable(),
  /** navigate / search / history / suggestion */
  url: z.string().optional(),
  /** tab */
  tabId: z.string().optional(),
  /** command */
  commandId: z.string().optional(),
});
export type CommandItem = z.output<typeof commandItemSchema>;

export const commandBarModeSchema = z.enum(['new', 'edit']);
export type CommandBarMode = z.output<typeof commandBarModeSchema>;

/** What the overlay should show. More floating UI joins this in later phases. */
export const overlayStateSchema = z.object({
  commandBar: z
    .object({
      mode: commandBarModeSchema,
      /** Pre-filled text (the current URL for ⌘L). */
      initialQuery: z.string(),
      /** Bumped on every open so the overlay resets even if the mode didn't change. */
      openedAt: z.number(),
    })
    .nullable(),
});
export type OverlayState = z.output<typeof overlayStateSchema>;
