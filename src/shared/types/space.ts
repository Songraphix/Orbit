import { profileViewSchema } from '../profile';
import { z } from 'zod';
import { OPEN_IN } from '../apps';

/** A space's look (PLAN.md section 5.4). */
export const spaceThemeSchema = z.object({
  mode: z.enum(['light', 'dark', 'system']),
  /** 1–3 colours for the sidebar gradient. */
  colors: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/i))
    .min(1)
    .max(3),
  /** 0–1: how strongly the colours tint the sidebar. */
  intensity: z.number().min(0).max(1),
  /** 0–1: film-grain overlay, like Arc. */
  noise: z.number().min(0).max(1),
});
export type SpaceTheme = z.output<typeof spaceThemeSchema>;

export const DEFAULT_THEME: SpaceTheme = {
  mode: 'dark',
  // Sea glass into deep night (the "Quietly Alive" palette); your Spaces keep their own.
  colors: ['#2f6b70', '#10262d'],
  intensity: 0.7,
  noise: 0.15,
};

export const spaceViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** An emoji, or a named built-in icon ("planet", "cloud", "video"…). */
  icon: z.string(),
  profileId: z.string(),
  theme: spaceThemeSchema,
});
export type SpaceView = z.output<typeof spaceViewSchema>;

/** One row in the sidebar, with its live state merged in. */
export const sidebarRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['tab', 'folder']),
  section: z.enum(['favorite', 'pinned', 'today']),
  parentId: z.string().nullable(),
  depth: z.number().int().min(0),
  title: z.string(),
  url: z.string().nullable(),
  favicon: z.string().nullable(),
  collapsed: z.boolean(),
  /** The tab has a live page (unloaded pinned tabs and favorites show greyed). */
  live: z.boolean(),
  isLoading: z.boolean(),
  /** A pinned tab or favorite that navigated away from its home URL. */
  awayFromHome: z.boolean(),
  /** Half of the Space's split view, showing or kept for later (roadmap P2.4). */
  split: z.boolean(),
  /** A Live Folder (F-28), and its last refresh error. */
  liveFolder: z.boolean(),
  liveError: z.string().nullable(),
  /** A Live Folder item that hasn't been opened yet (a dot). */
  unread: z.boolean(),
  /** A favourite's App Hub opening mode (tab, the docked panel, its own window). */
  openIn: z.enum(OPEN_IN).default('tab'),
  /** A Peek kept open from this tab (Arc): its page's icon sits on the tab's icon. */
  peek: z.object({ favicon: z.string().nullable(), title: z.string() }).nullable().default(null),
});
export type SidebarRow = z.output<typeof sidebarRowSchema>;

export const sidebarSnapshotSchema = z.object({
  spaces: z.array(spaceViewSchema),
  activeSpaceId: z.string(),
  /** The active space's profile (the toolbar's avatar). */
  profile: profileViewSchema,
  favorites: z.array(sidebarRowSchema),
  pinned: z.array(sidebarRowSchema),
  today: z.array(sidebarRowSchema),
  activeItemId: z.string().nullable(),
  /** Tidy (F-29) for the active space: offered (a key is set), working, or undoable. `assistant`:
   *  the toolbar offers the assistant (unless AI is turned off in Settings). */
  tidy: z.object({
    available: z.boolean(),
    running: z.boolean(),
    canUndo: z.boolean(),
    assistant: z.boolean(),
    /** Group Tabs has folders to suggest for a crowded Today (roadmap R2 M4). */
    suggestGroups: z.boolean().default(false),
  }),
});
export type SidebarSnapshot = z.output<typeof sidebarSnapshotSchema>;

export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_SPACE_ID = 'default-space';
