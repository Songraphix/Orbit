import { z } from 'zod';
import { wallpaperChoiceSchema } from './types/newtab';
import { DEFAULT_HOME, homeSettingsSchema } from './types/home';
import { rectSchema, SIDEBAR_WIDTH } from './types/layout';

/**
 * Every persisted setting, with its schema and default. Stored as JSON in the `settings` table.
 * A stored value that no longer matches its schema falls back to the default.
 */
export const settingsSchema = {
  /** Last normal (non-maximised) window bounds, plus whether it was maximised. */
  'window.state': z.object({
    bounds: z
      .object({
        x: z.number().int(),
        y: z.number().int(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .nullable(),
    isMaximized: z.boolean(),
  }),
  'sidebar.width': z.number().int().min(SIDEBAR_WIDTH.min).max(SIDEBAR_WIDTH.max),
  'sidebar.visible': z.boolean(),
  'newtab.wallpaper': wallpaperChoiceSchema,
  /** The new tab page's theme, tagline and widgets. */
  'newtab.home': homeSettingsSchema,
  /** The space the main window shows. */
  'window.activeSpace': z.string().nullable(),
  /** Today tabs not opened for this long are archived (F-20). */
  'archive.after': z.enum(['12h', '24h', '7d', '30d', 'never']),
  /** Live pages beyond this many are put to sleep, least recently used first (F-25). */
  'tabs.maxLive': z.number().int().min(1).max(50),
  /** Pages not viewed for this many minutes are put to sleep. 0 = only the maxLive limit. */
  'tabs.sleepAfterMinutes': z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  /** Links from pinned tabs and favorites to other sites open in a Peek preview (F-23). */
  'peek.enabled': z.boolean(),
  /** Whose links Peek: any tab's, or only pinned tabs' and favorites' (Arc's default). */
  'peek.scope': z.enum(['all', 'pinned']),
  /** ⌥⌘N opens an empty Little Orbit from any app (F-24). */
  'little.globalShortcut': z.boolean(),
  /** Floating notes (F-33) open when Orbit quit, reopened at launch. */
  'notes.floating': z
    .array(z.object({ id: z.string(), bounds: rectSchema, onTop: z.boolean() }))
    .max(50),
  /** Search engine URL with %s for the query. */
  'search.engine': z.enum(['google', 'duckduckgo', 'bing', 'kagi', 'ecosia']),
} as const;

export type Settings = { [K in SettingKey]: z.output<(typeof settingsSchema)[K]> };
export type SettingKey = keyof typeof settingsSchema;

export const settingsDefaults: Settings = {
  'window.state': { bounds: null, isMaximized: false },
  'sidebar.width': 260,
  'sidebar.visible': true,
  'newtab.wallpaper': { kind: 'builtin', id: 'aurora' },
  'newtab.home': DEFAULT_HOME,
  'window.activeSpace': null,
  'archive.after': '12h',
  'tabs.maxLive': 8,
  'tabs.sleepAfterMinutes': 30,
  'search.engine': 'google',
  'peek.enabled': true,
  'peek.scope': 'all',
  'little.globalShortcut': true,
  'notes.floating': [],
};

/** Query URL templates for `search.engine`. */
export const SEARCH_ENGINES: Record<Settings['search.engine'], { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
};

/** The settings the Settings page edits. */
export const userSettingsSchema = z.object({
  archiveAfter: settingsSchema['archive.after'],
  maxLive: settingsSchema['tabs.maxLive'],
  sleepAfterMinutes: settingsSchema['tabs.sleepAfterMinutes'],
  searchEngine: settingsSchema['search.engine'],
  peek: settingsSchema['peek.enabled'],
  peekScope: settingsSchema['peek.scope'],
  littleShortcut: settingsSchema['little.globalShortcut'],
});
export type UserSettings = z.output<typeof userSettingsSchema>;
