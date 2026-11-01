import { z } from 'zod';

/** The Library's sections (F-11, Img 4), in sidebar order. */
export const LIBRARY_SECTIONS = [
  'media',
  'downloads',
  'easels',
  'spaces',
  'boosts',
  'archive',
] as const;
export const librarySectionSchema = z.enum(LIBRARY_SECTIONS);
export type LibrarySection = z.output<typeof librarySectionSchema>;

/** Whether the window's sidebar is in Library mode, and which section the content area shows. */
export const libraryStateSchema = z.object({ section: librarySectionSchema.nullable() });
export type LibraryState = z.output<typeof libraryStateSchema>;

/** An image or video in Library → Media: a finished download or a screenshot. */
export const mediaItemSchema = z.object({
  /** `download:<id>` or `capture:<file name>`. */
  id: z.string(),
  name: z.string(),
  kind: z.enum(['image', 'video']),
  source: z.enum(['download', 'capture']),
  createdAt: z.number(),
  thumbnail: z.string().nullable(),
});
export type MediaItem = z.output<typeof mediaItemSchema>;

export const mediaIdSchema = z.string().regex(/^(download:[\w-]{1,64}|capture:[^/\\]{1,200})$/);

/** One row of Library → Downloads (every download, not just the shelf's recent ones). */
export const downloadEntrySchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
  state: z.enum(['progressing', 'completed', 'cancelled', 'interrupted']),
  totalBytes: z.number(),
  startedAt: z.number(),
  /** False once the file was moved or deleted. */
  exists: z.boolean(),
  /** "Image", "PDF", "Video"… (Arc's second line). */
  kind: z.string(),
  thumbnail: z.string().nullable(),
});
export type DownloadEntry = z.output<typeof downloadEntrySchema>;

/** A tab or folder as Library → Spaces lists it. */
export const spaceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  favicon: z.string().nullable(),
  folder: z.boolean(),
  depth: z.number(),
});

/** One space in Library → Spaces: a column of its pinned and Today tabs (Arc). */
export const spaceEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  profileName: z.string(),
  tabs: z.number(),
  active: z.boolean(),
  pinned: z.array(spaceItemSchema),
  today: z.array(spaceItemSchema),
});
export type SpaceEntry = z.output<typeof spaceEntrySchema>;

/** How an internal page should look: the window's space theme as CSS variables (Arc's Library
 *  and Easels follow the space's colours). */
export const appearanceSchema = z.object({
  mode: z.enum(['light', 'dark']),
  vars: z.record(z.string(), z.string()),
});
export type Appearance = z.output<typeof appearanceSchema>;

/** One Boost in Library → Boosts. */
export const boostEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  enabled: z.boolean(),
});
export type BoostEntry = z.output<typeof boostEntrySchema>;
