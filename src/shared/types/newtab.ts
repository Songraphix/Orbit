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
] as const;
export type BuiltinWallpaperId = (typeof BUILTIN_WALLPAPERS)[number]['id'];

const builtinIds = BUILTIN_WALLPAPERS.map((w) => w.id) as [
  BuiltinWallpaperId,
  ...BuiltinWallpaperId[],
];

/** The stored choice. A custom image lives at <userData>/wallpapers/custom.jpg. */
export const wallpaperChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), id: z.enum(builtinIds) }),
  z.object({ kind: z.literal('custom') }),
]);
export type WallpaperChoice = z.output<typeof wallpaperChoiceSchema>;

/** The wallpaper part of the page. */
export const wallpaperStateSchema = z.object({
  wallpaper: wallpaperChoiceSchema,
  /** The custom image as a JPEG data: URL, when one has been chosen. */
  customImage: z.string().nullable(),
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
