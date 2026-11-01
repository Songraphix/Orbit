import { z } from 'zod';

/** Colour tool (F-18): a filter over the whole page. `dark` inverts it (media re-inverted). */
export const boostColorSchema = z.object({
  hue: z.number().int().min(-180).max(180),
  saturation: z.number().int().min(0).max(300),
  brightness: z.number().int().min(50).max(150),
  dark: z.boolean(),
});
export type BoostColor = z.output<typeof boostColorSchema>;

/** A font family name: letters, digits, spaces and hyphens only (it ends up in CSS). */
export const boostFontSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/)
  .nullable();

/** A zapped element's selector. Braces, semicolons, `@` and `<` could break out of the rule. */
export const zapSelectorSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[^{};@<\n\r]+$/);

export const boostSettingsSchema = z.object({
  color: boostColorSchema.nullable(),
  font: boostFontSchema,
  zapped: z.array(zapSelectorSchema).max(200),
});
export type BoostSettings = z.output<typeof boostSettingsSchema>;

export const EMPTY_BOOST_SETTINGS: BoostSettings = { color: null, font: null, zapped: [] };

/** A per-site customisation (F-18). `domain` matches the host and its subdomains; '' matches nothing. */
export const boostSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  enabled: z.boolean(),
  css: z.string(),
  js: z.string(),
  settings: boostSettingsSchema,
  updatedAt: z.number(),
});
export type Boost = z.output<typeof boostSchema>;

/** What the editor may change. */
export const boostPatchSchema = z
  .object({
    name: z.string().min(1).max(80),
    domain: z.string().max(253),
    enabled: z.boolean(),
    css: z.string().max(200_000),
    js: z.string().max(200_000),
    settings: boostSettingsSchema,
  })
  .partial()
  .strict();
export type BoostPatch = z.output<typeof boostPatchSchema>;

/** A Boost row in the site controls popover. */
export const boostSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
});
export type BoostSummary = z.output<typeof boostSummarySchema>;

export const boostIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
