import { lookSchema, ROTATIONS, unsplashPhotoSchema } from '../backgrounds';
import { homeLayoutSchema } from '../home-widgets';
import { z } from 'zod';
import { homeSettingsSchema, shortcutSchema, todoSchema } from './home';

/** Built-in wallpapers (rendered as layered CSS gradients by the new tab page). */
export const BUILTIN_WALLPAPERS = [
  { id: 'aurora', name: 'Aurora' },
  { id: 'dusk', name: 'Dusk' },
  { id: 'lagoon', name: 'Lagoon' },
  { id: 'ember', name: 'Ember' },
  { id: 'orchid', name: 'Orchid' },
  { id: 'forest', name: 'Forest' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'dune', name: 'Dune' },
  { id: 'glacier', name: 'Glacier' },
  { id: 'nebula', name: 'Nebula' },
  { id: 'meadow', name: 'Meadow' },
  { id: 'peach', name: 'Peach' },
  { id: 'rosewood', name: 'Rosewood' },
  { id: 'slate', name: 'Slate' },
] as const;
export type BuiltinWallpaperId = (typeof BUILTIN_WALLPAPERS)[number]['id'];

const builtinIds = BUILTIN_WALLPAPERS.map((w) => w.id) as [
  BuiltinWallpaperId,
  ...BuiltinWallpaperId[],
];

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

/** The stored choice. A custom image lives at <userData>/wallpapers/custom.jpg. Colours,
 *  gradients and Unsplash photos arrived with brief M4. */
export const wallpaperChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), id: z.enum(builtinIds) }),
  z.object({ kind: z.literal('custom') }),
  z.object({ kind: z.literal('color'), color: hex }),
  z.object({
    kind: z.literal('gradient'),
    from: hex,
    to: hex,
    angle: z.number().int().min(0).max(360),
  }),
  z.object({ kind: z.literal('unsplash'), photo: unsplashPhotoSchema }),
]);
export type WallpaperChoice = z.output<typeof wallpaperChoiceSchema>;

/** The wallpaper part of the page. */
export const wallpaperStateSchema = z.object({
  /** The background you chose. */
  wallpaper: wallpaperChoiceSchema,
  /** What this page shows: the chosen one, or today's (rotation). */
  shown: wallpaperChoiceSchema,
  /** The custom image as a JPEG data: URL, when one has been chosen. */
  customImage: z.string().nullable(),
  look: lookSchema,
  favorites: z.array(wallpaperChoiceSchema),
  rotation: z.enum(ROTATIONS),
  /** An Unsplash access key is saved (Settings → Integrations). */
  unsplash: z.boolean(),
});
export type WallpaperState = z.output<typeof wallpaperStateSchema>;

/** What the new tab page needs to draw itself. */
export const newTabStateSchema = wallpaperStateSchema.extend({
  home: homeSettingsSchema,
  /** Your name, from this tab's profile ('' = none yet). */
  name: z.string(),
  shortcuts: z.array(shortcutSchema),
  todos: z.array(todoSchema),
  /** The widgets below the search box (brief M3). */
  layout: homeLayoutSchema,
});
export type NewTabState = z.output<typeof newTabStateSchema>;
