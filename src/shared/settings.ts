import { z } from 'zod';

/**
 * Every persisted setting, with its schema and default. Stored as JSON in the `settings` table.
 * A stored value that no longer matches its schema falls back to the default.
 */
export const settingsSchema = {
  /** Last normal (non-maximised) window bounds, plus whether it was maximised. */
  'window.state': z.object({
    bounds: z
      .object({
        x: z.number().int(),
        y: z.number().int(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .nullable(),
    isMaximized: z.boolean(),
  }),
  'sidebar.width': z.number().int().min(200).max(400),
  'sidebar.visible': z.boolean(),
} as const;

export type Settings = { [K in SettingKey]: z.output<(typeof settingsSchema)[K]> };
export type SettingKey = keyof typeof settingsSchema;

export const settingsDefaults: Settings = {
  'window.state': { bounds: null, isMaximized: false },
  'sidebar.width': 260,
  'sidebar.visible': true,
};
