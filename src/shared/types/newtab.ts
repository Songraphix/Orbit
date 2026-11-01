import { z } from 'zod';

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

/** What the new tab page needs to draw itself. */
export const newTabStateSchema = z.object({
  wallpaper: wallpaperChoiceSchema,
  /** The custom image as a JPEG data: URL, when one has been chosen. */
  customImage: z.string().nullable(),
});
export type NewTabState = z.output<typeof newTabStateSchema>;
