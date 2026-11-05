import { BUILTIN_WALLPAPERS, builtinPhoto } from './types/newtab';
import type { BuiltinWallpaperId, WallpaperChoice } from './types/newtab';

/** Where Orbit's own pages find the built-in photographs (every page is one folder deep). */
export const PHOTO_BASE = '../wallpapers/';

/** Each built-in photograph's average colour: shown while it loads, and its palette's
 *  fallback. (Measured from the shipped files.) */
export const PHOTO_AVERAGE: Record<string, string> = {
  'misty-sunrise': '#7563b1',
  'golden-valley': '#a28b89',
  'sky-terrace': '#9b9083',
  'cloud-terrace': '#a5a398',
  'cosmic-clouds': '#3a4371',
  'aurora-glass': '#236579',
  'highland-tarn': '#977766',
  'white-arches': '#696f77',
};

/** A built-in photograph's CSS: the image over its average colour. */
const photo = (id: string) =>
  `url("${PHOTO_BASE}${builtinPhoto(id)}"), ${PHOTO_AVERAGE[id] ?? '#1a1d2e'}`;

/** Soft "mesh" wallpapers: a few blurred colour blobs over a deep base colour. */
function mesh(base: string, blobs: [x: number, y: number, color: string, size: number][]): string {
  return [
    ...blobs.map(
      ([x, y, color, size]) =>
        `radial-gradient(at ${x}% ${y}%, ${color} 0px, transparent ${size}%)`,
    ),
    base,
  ].join(', ');
}

/**
 * Atmospheres: a calm base gradient (sky to depth) under a few very soft light fields. The
 * fields also drift on their own layers (see ATMOSPHERE_FIELDS) when ambient motion is on.
 */
export const ATMOSPHERE_FIELDS: Partial<
  Record<
    BuiltinWallpaperId,
    { base: string; fields: [x: number, y: number, color: string, size: number][] }
  >
> = {
  tide: {
    base: 'linear-gradient(170deg, #20414d 0%, #12303a 38%, #0b1d25 72%, #08161c 100%)',
    fields: [
      [22, 18, 'rgb(124 196 181 / 0.55)', 46],
      [78, 12, 'rgb(141 180 209 / 0.5)', 44],
      [60, 82, 'rgb(36 92 110 / 0.7)', 52],
      [14, 88, 'rgb(220 205 181 / 0.18)', 40],
    ],
  },
  seaglass: {
    base: 'linear-gradient(175deg, #dfeaee 0%, #c9dde2 40%, #a9c9cf 75%, #8fb6bd 100%)',
    fields: [
      [18, 22, 'rgb(247 244 239 / 0.85)', 44],
      [80, 18, 'rgb(141 180 209 / 0.55)', 46],
      [62, 86, 'rgb(124 196 181 / 0.6)', 50],
      [10, 80, 'rgb(220 205 181 / 0.45)', 40],
    ],
  },
  pearl: {
    base: 'linear-gradient(170deg, #f3eee6 0%, #e7e0d4 45%, #d6d3cb 78%, #c4cdcf 100%)',
    fields: [
      [24, 20, 'rgb(255 252 247 / 0.9)', 46],
      [80, 30, 'rgb(220 205 181 / 0.55)', 44],
      [50, 92, 'rgb(141 180 209 / 0.4)', 50],
    ],
  },
};

const atmosphere = (id: BuiltinWallpaperId) => {
  const a = ATMOSPHERE_FIELDS[id]!;
  return [
    ...a.fields.map(
      ([x, y, color, size]) =>
        `radial-gradient(at ${x}% ${y}%, ${color} 0px, transparent ${size}%)`,
    ),
    a.base,
  ].join(', ');
};

const PHOTOS = Object.fromEntries(
  BUILTIN_WALLPAPERS.filter((w) => 'photo' in w).map((w) => [w.id, photo(w.id)]),
) as Record<BuiltinWallpaperId, string>;

export const WALLPAPER_CSS: Record<BuiltinWallpaperId, string> = {
  ...PHOTOS,
  tide: atmosphere('tide'),
  seaglass: atmosphere('seaglass'),
  pearl: atmosphere('pearl'),
  aurora: mesh('#0b1026', [
    [18, 18, '#38e8b6', 48],
    [82, 8, '#7b5cff', 46],
    [62, 88, '#1fa2ff', 52],
    [8, 92, '#3a2a8f', 40],
  ]),
  dusk: mesh('#2b1640', [
    [15, 85, '#ff7e5f', 50],
    [70, 75, '#feb47b', 42],
    [85, 10, '#6a3093', 55],
    [30, 20, '#b0466d', 45],
  ]),
  lagoon: mesh('#023047', [
    [20, 25, '#00c9a7', 50],
    [80, 30, '#00a3ff', 48],
    [55, 95, '#8ff0dc', 40],
  ]),
  ember: mesh('#1a0a0a', [
    [20, 80, '#ff512f', 50],
    [75, 70, '#f09819', 42],
    [70, 10, '#dd2476', 48],
  ]),
  orchid: mesh('#1b0b2e', [
    [25, 20, '#da22ff', 46],
    [80, 60, '#9733ee', 50],
    [35, 95, '#ff9a9e', 40],
  ]),
  forest: mesh('#0a1f14', [
    [20, 30, '#134e5e', 55],
    [75, 70, '#71b280', 45],
    [85, 15, '#a8e063', 32],
  ]),
  midnight: mesh('#05060f', [
    [25, 25, '#3a1c71', 50],
    [75, 35, '#283c86', 50],
    [50, 100, '#1b4d5c', 45],
  ]),
  dune: mesh('#3b2a20', [
    [20, 20, '#e6b980', 50],
    [80, 30, '#eacda3', 42],
    [55, 95, '#c06c84', 48],
  ]),
  glacier: mesh('#0c1a2b', [
    [15, 20, '#a1c4fd', 50],
    [80, 25, '#c2e9fb', 42],
    [50, 95, '#4b79a1', 50],
  ]),
  nebula: mesh('#0a0518', [
    [20, 70, '#ff6ec4', 42],
    [75, 25, '#7873f5', 48],
    [45, 10, '#4ade80', 28],
    [90, 90, '#1e3a8a', 45],
  ]),
  meadow: mesh('#0f2414', [
    [20, 20, '#d4fc79', 42],
    [80, 65, '#96e6a1', 48],
    [35, 95, '#2f855a', 45],
  ]),
  peach: mesh('#3a1e1e', [
    [25, 25, '#ffd1a9', 50],
    [80, 30, '#ff9a8b', 45],
    [60, 95, '#ff6a88', 45],
  ]),
  rosewood: mesh('#1f0a10', [
    [20, 80, '#b24592', 48],
    [80, 20, '#f15f79', 44],
    [60, 60, '#5b1a3a', 40],
  ]),
  slate: mesh('#111418', [
    [20, 25, '#434343', 50],
    [80, 70, '#2c3e50', 50],
    [50, 5, '#6b7b8c', 32],
  ]),
};

/** Film-grain overlay (SVG noise) that keeps gradients from looking flat or banding. */
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

/** A built-in's small picture for galleries: a photo's thumbnail (the whole picture, cropped
 *  to the tile), or the CSS itself for the drawn ones. */
export function wallpaperThumb(id: BuiltinWallpaperId): string {
  const file = builtinPhoto(id);
  return file
    ? `url("${PHOTO_BASE}thumbs/${file}") center / cover no-repeat, ${PHOTO_AVERAGE[id] ?? '#1a1d2e'}`
    : WALLPAPER_CSS[id];
}

/** Whether a background is a photograph (your image, Unsplash, a built-in photo): it gets the
 *  fit, position and veil adjustments. */
export const isPhotoChoice = (c: WallpaperChoice) =>
  c.kind === 'custom' ||
  c.kind === 'unsplash' ||
  (c.kind === 'builtin' && builtinPhoto(c.id) !== null);

/** A background's CSS (its image layer). */
export function backgroundCss(choice: WallpaperChoice, customImage: string | null): string {
  switch (choice.kind) {
    case 'builtin':
      return WALLPAPER_CSS[choice.id];
    case 'custom':
      return customImage ? `url("${customImage}")` : WALLPAPER_CSS.aurora;
    case 'color':
      return choice.color;
    case 'gradient':
      return `linear-gradient(${choice.angle}deg, ${choice.from}, ${choice.to})`;
    case 'unsplash':
      return `url("${choice.photo.url}")`;
  }
}
