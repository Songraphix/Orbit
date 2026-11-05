import { z } from 'zod';
import { lookSchema } from '../backgrounds';
import { wallpaperChoiceSchema } from './newtab';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * The window's canvas (UI spec §4): the wallpaper every island floats on, and the theme taken
 * from it. Main computes it (the palette is read on this Mac and cached) and sends it to every
 * shell and overlay (`state:canvas`) and Orbit page (`canvas:update`). Pages other than the
 * shell get it without the custom image (they don't draw the canvas).
 */
export const canvasStateSchema = z.object({
  wallpaper: wallpaperChoiceSchema,
  /** Your own image as a data: URL (shells only; null elsewhere or when not chosen). */
  customImage: z.string().nullable(),
  look: lookSchema,
  /** Light glass with dark text, or the other way round. */
  tone: z.enum(['light', 'dark']),
  /** The accent in use (yours if you chose one, else the wallpaper's). */
  accent: hex,
  accent2: hex,
  average: hex,
  /** Automatic palette: the accent follows the wallpaper (off: each Space's colour). */
  auto: z.boolean(),
  vars: z.record(z.string().regex(/^--[a-z0-9-]+$/), z.string().max(240)),
});
export type CanvasState = z.output<typeof canvasStateSchema>;

/** Where a page's view sits in its window, so it can line its own wallpaper up with the canvas. */
export const canvasFrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  windowWidth: z.number(),
  windowHeight: z.number(),
});
export type CanvasFrame = z.output<typeof canvasFrameSchema>;
