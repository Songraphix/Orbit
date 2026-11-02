import { z } from 'zod';

/**
 * The Toolkit in the productivity panel (roadmap P3.5, P3.6): what main keeps for it and sends
 * when it changes — colours you picked, an image you inspected, the page's palette, local dev
 * servers, and the active tab's responsive viewport.
 */

export const TOOLKIT_SECTIONS = [
  'colors',
  'contrast',
  'type',
  'image',
  'css',
  'code',
  'dev',
] as const;
export type ToolkitSection = (typeof TOOLKIT_SECTIONS)[number];

export const imageReportSchema = z.object({
  src: z.string(),
  /** The page it was on. */
  page: z.string(),
  alt: z.string(),
  format: z.string(),
  /** The server's content type, when it said. */
  type: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  bytes: z.number().nullable(),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
  /** A small JPEG of it, for the panel. */
  preview: z.string().nullable(),
  error: z.string().nullable(),
});
export type ImageReport = z.output<typeof imageReportSchema>;

export const swatchSchema = z.object({
  hex: z.string(),
  /** How many elements use it. */
  count: z.number().int(),
  text: z.boolean(),
  background: z.boolean(),
});
export type Swatch = z.output<typeof swatchSchema>;

export const localServerSchema = z.object({
  port: z.number().int(),
  url: z.string(),
  title: z.string(),
});
export type LocalServer = z.output<typeof localServerSchema>;

/** A device size for responsive mode. */
export const viewportSchema = z.object({
  width: z.number().int().min(200).max(4000),
  height: z.number().int().min(200).max(4000),
  /** A phone or tablet (drawn with a device's rounded corners). */
  mobile: z.boolean(),
});
export type Viewport = z.output<typeof viewportSchema>;

export const VIEWPORT_PRESETS: readonly (Viewport & { name: string })[] = [
  { name: 'iPhone SE', width: 375, height: 667, mobile: true },
  { name: 'iPhone 15', width: 393, height: 852, mobile: true },
  { name: 'iPhone 15 Pro Max', width: 430, height: 932, mobile: true },
  { name: 'Pixel 8', width: 412, height: 915, mobile: true },
  { name: 'iPad mini', width: 768, height: 1024, mobile: true },
  { name: 'iPad Air', width: 820, height: 1180, mobile: true },
  { name: 'Laptop', width: 1280, height: 800, mobile: false },
  { name: 'Desktop', width: 1440, height: 900, mobile: false },
];

export const presetName = (v: Pick<Viewport, 'width' | 'height'>) =>
  VIEWPORT_PRESETS.find(
    (p) =>
      (p.width === v.width && p.height === v.height) ||
      (p.width === v.height && p.height === v.width),
  )?.name ?? null;

export const toolkitStateSchema = z.object({
  /** Colours you picked, newest first. */
  colors: z.array(z.string()).max(16),
  image: imageReportSchema.nullable(),
  palette: z.object({ page: z.string(), swatches: z.array(swatchSchema) }).nullable(),
  /** The fonts the page uses (roadmap P4.6), most used first. */
  fonts: z
    .object({
      page: z.string(),
      families: z.array(
        z.object({
          family: z.string(),
          count: z.number().int(),
          sizes: z.array(z.number()),
          weights: z.array(z.number()),
        }),
      ),
    })
    .nullable(),
  servers: z.array(localServerSchema).nullable(),
  /** The tab you're on: what the page tools work with (null: no tab open). */
  page: z
    .object({
      title: z.string(),
      host: z.string(),
      /** A site (not one of Orbit's pages): responsive mode works on sites only. */
      web: z.boolean(),
      viewport: viewportSchema.nullable(),
    })
    .nullable(),
});
export type ToolkitState = z.output<typeof toolkitStateSchema>;
