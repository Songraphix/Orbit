import { z } from 'zod';

/**
 * Homepage backgrounds (brief §4, milestone M4): built-ins, your image, a colour, a gradient
 * or an Unsplash photo; adjustments for readability (brightness, blur, saturation, contrast,
 * overlay, position, fit); favourites; and rotation (daily or on every new tab). Pure parts
 * here, unit-tested; the choice itself is stored as `newtab.wallpaper`.
 */

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

/** An Unsplash photo, as Unsplash's API guidelines want it kept: hot-linked, with credit. */
export const unsplashPhotoSchema = z.object({
  id: z.string().min(1).max(40),
  /** The image to show (images.unsplash.com, sized for a screen). */
  url: z.string().url().max(2000),
  thumb: z.string().url().max(2000),
  /** Its average colour, shown while it loads. */
  color: hex.nullable(),
  author: z.string().max(120),
  /** The photographer's and the photo's pages (with Unsplash's referral parameters). */
  authorUrl: z.string().url().max(500),
  pageUrl: z.string().url().max(500),
  /** Unsplash asks to be told when a photo is used (its download endpoint). */
  downloadLocation: z.string().url().max(500),
});
export type UnsplashPhoto = z.output<typeof unsplashPhotoSchema>;

export const lookSchema = z.object({
  /** Percent (100 = as is). */
  brightness: z.number().min(40).max(140),
  blur: z.number().min(0).max(24),
  saturation: z.number().min(0).max(200),
  contrast: z.number().min(50).max(150),
  /** A dark veil for readable text, percent. */
  overlay: z.number().min(0).max(80),
  position: z.enum(['center', 'top', 'bottom']),
  fit: z.enum(['cover', 'contain']),
  /** Atmospheres drift very slowly (off: still; Reduce Motion stills them too). */
  ambient: z.boolean().default(true),
});
export type BackgroundLook = z.output<typeof lookSchema>;

export const DEFAULT_LOOK: BackgroundLook = {
  brightness: 100,
  blur: 0,
  saturation: 100,
  contrast: 100,
  overlay: 15,
  position: 'center',
  fit: 'cover',
  ambient: true,
};

export const ROTATIONS = ['off', 'daily', 'every-tab'] as const;
export type Rotation = (typeof ROTATIONS)[number];

/** A short key that identifies a background (favourites, "is this the current one"). */
export function backgroundKey(
  choice:
    | { kind: 'builtin'; id: string }
    | { kind: 'custom' }
    | { kind: 'color'; color: string }
    | { kind: 'gradient'; from: string; to: string; angle: number }
    | { kind: 'unsplash'; photo: { id: string } },
): string {
  switch (choice.kind) {
    case 'builtin':
      return `builtin:${choice.id}`;
    case 'custom':
      return 'custom';
    case 'color':
      return `color:${choice.color.toLowerCase()}`;
    case 'gradient':
      return `gradient:${choice.from.toLowerCase()}:${choice.to.toLowerCase()}:${choice.angle}`;
    case 'unsplash':
      return `unsplash:${choice.photo.id}`;
  }
}

/** Day number for a local date "YYYY-MM-DD" (rotation picks by it). Pure. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * The background to show under a rotation: the same one all day (daily), a different one each
 * new tab (every-tab, never the same twice running), or none (off: the chosen one). Pure.
 */
export function rotate<T>(
  pool: readonly T[],
  rotation: Rotation,
  today: string,
  previous: number | null,
  random: () => number = Math.random,
): { pick: T; index: number } | null {
  if (rotation === 'off' || pool.length === 0) return null;
  if (rotation === 'daily') {
    const index = dayNumber(today) % pool.length;
    return { pick: pool[index]!, index };
  }
  let index = Math.floor(random() * pool.length);
  if (pool.length > 1 && index === previous) index = (index + 1) % pool.length;
  return { pick: pool[index]!, index };
}

/** CSS for the photo or image layer. Pure. */
export function lookFilter(look: BackgroundLook): string {
  const parts = [
    look.brightness !== 100 && `brightness(${look.brightness}%)`,
    look.saturation !== 100 && `saturate(${look.saturation}%)`,
    look.contrast !== 100 && `contrast(${look.contrast}%)`,
    look.blur > 0 && `blur(${look.blur}px)`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}

/** Unsplash's referral parameters for credit links (its API guidelines). */
export const UNSPLASH_UTM = 'utm_source=orbit_browser&utm_medium=referral';

export function withUtm(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${UNSPLASH_UTM}`;
}
