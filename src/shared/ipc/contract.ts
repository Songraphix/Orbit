import { z } from 'zod';
import { layoutSchema, rectSchema } from '../types/layout';
import { siteActionSchema } from '../types/site-controls';
import { boostIdSchema, boostPatchSchema, boostSchema } from '../types/boosts';
import { easelCaptureSchema, easelEntrySchema, easelIdSchema, easelSchema } from '../types/easels';
import {
  NOTE_LIMITS,
  noteActionSchema,
  noteEntrySchema,
  noteIdSchema,
  noteSchema,
} from '../types/notes';
import {
  boostEntrySchema,
  downloadEntrySchema,
  librarySectionSchema,
  libraryStateSchema,
  appearanceSchema,
  mediaIdSchema,
  mediaItemSchema,
  spaceEntrySchema,
} from '../types/library';
import {
  commandBarModeSchema,
  commandItemSchema,
  overlayStateSchema,
  promptAnswerSchema,
} from '../types/command-bar';
import { downloadsSnapshotSchema, recentDownloadSchema } from '../types/downloads';
import { findStateSchema } from '../types/find';
import { mediaStateSchema } from '../types/media';
import { newTabStateSchema, wallpaperChoiceSchema } from '../types/newtab';
import { sidebarSnapshotSchema, spaceThemeSchema } from '../types/space';
import { userSettingsSchema } from '../settings';
import { profilePatchSchema, profileViewSchema } from '../profile';
import { homeSettingsSchema } from '../types/home';
import { CAPTURE_LIMITS, captureDraftSchema } from '../capture';
import { focusSessionSchema } from '../focus';
import {
  PROJECT_STATUSES,
  TASK_STATUSES,
  projectInputSchema,
  taskInputSchema,
  workDataSchema,
} from '../work';
import { tabsSnapshotSchema } from '../types/tabs';

/**
 * Every IPC channel lives here (PLAN.md section 4.4). Names follow `domain:verb`.
 *
 * - `contract`: renderer → main requests (`window.orbit.invoke`). Main validates `input` with zod
 *   and checks the sender before running the handler.
 * - `events`: main → renderer pushes (`window.orbit.on`), mostly `state:*` snapshots.
 *
 * Add a channel here first, then its handler in src/main/ipc/handlers/.
 */
/** Orbit's own UI surfaces (PLAN.md section 4.2). Web content is never a surface. */
export type Surface = 'shell' | 'overlay' | 'internal';

export type ChannelSpec = {
  input: z.ZodType;
  output: z.ZodType;
  /** Who may call this channel. Defaults to the shell and overlay. */
  surfaces?: readonly Surface[];
};

export const DEFAULT_SURFACES: readonly Surface[] = ['shell', 'overlay'];

const tabId = z.string().min(1).max(64);

export const contract = {
  'app:getInfo': {
    input: z.object({}).strict(),
    output: z.object({
      name: z.string(),
      version: z.string(),
      electron: z.string(),
      chrome: z.string(),
      platform: z.string(),
    }),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'layout:get': {
    input: z.object({}).strict(),
    output: layoutSchema,
  },
  'sidebar:toggle': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  /** The pointer reached the hidden sidebar's edge (open) or left the slid-out sidebar. */
  'sidebar:peek': {
    input: z.object({ open: z.boolean() }).strict(),
    output: z.void(),
  },
  'sidebar:setWidth': {
    input: z.object({ width: z.number().finite() }).strict(),
    output: z.void(),
  },
  /** The pointer reached the sidebar edge: capture the page now, in case a drag follows. */
  'sidebar:prepareResize': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  /** Native web views swallow pointer events, so while the sidebar edge is dragged the active
   *  view is hidden and the shell shows this still snapshot (JPEG data: URL) in its place. */
  'sidebar:beginResize': {
    input: z.object({}).strict(),
    output: z.object({ snapshot: z.string().nullable() }),
  },
  'sidebar:endResize': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  /** Split view (F-13): the active tab beside `tabId`, or beside a new tab page. */
  'split:create': {
    input: z.object({ tabId: tabId.optional() }).strict(),
    output: z.void(),
  },
  'split:exit': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'split:swap': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  /** The left pane's share of the width while the divider is dragged (clamped to 0.2–0.8). */
  'split:setRatio': {
    input: z.object({ ratio: z.number().finite() }).strict(),
    output: z.void(),
  },
  /** Divider drag: both pages are hidden meanwhile, as native views swallow pointer events. */
  'split:beginResize': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'split:endResize': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'tabs:get': {
    input: z.object({}).strict(),
    output: tabsSnapshotSchema,
  },
  'tabs:create': {
    /** No url → the new tab page. */
    input: z.object({ url: z.string().max(8192).optional() }).strict(),
    output: z.object({ tabId }),
  },
  'tabs:activate': {
    input: z.object({ tabId }).strict(),
    output: z.void(),
  },
  'tabs:close': {
    input: z.object({ tabId }).strict(),
    output: z.void(),
  },
  /** Toolbar navigation for one tab (F-14). `reload` stops instead while the page is loading. */
  'tabs:navigate': {
    input: z
      .object({
        tabId,
        action: z.enum(['back', 'forward', 'reload', 'hardReload', 'stop']),
      })
      .strict(),
    output: z.void(),
  },

  // Sidebar tree and spaces (F-02…F-08). Right-click menus are native, built in main.
  'sidebar:get': {
    input: z.object({}).strict(),
    output: sidebarSnapshotSchema,
  },
  'sidebar:toggleFolder': {
    input: z.object({ itemId: tabId }).strict(),
    output: z.void(),
  },
  'sidebar:goHome': {
    input: z.object({ itemId: tabId }).strict(),
    output: z.void(),
  },
  /** Tidy (F-29): group the space's loose Today tabs with Claude; or undo the last Tidy. */
  'sidebar:tidy': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'sidebar:untidy': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'sidebar:clearToday': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'sidebar:rename': {
    input: z.object({ itemId: tabId, title: z.string().max(200) }).strict(),
    output: z.void(),
  },
  'sidebar:move': {
    input: z
      .object({
        itemId: tabId,
        section: z.enum(['favorite', 'pinned', 'today']),
        parentId: tabId.nullable(),
        beforeId: tabId.nullable(),
      })
      .strict(),
    output: z.void(),
  },
  'sidebar:itemMenu': {
    input: z.object({ itemId: tabId }).strict(),
    output: z.void(),
  },
  /** Right-click on the sidebar's empty space: a native menu built in main. */
  'sidebar:backgroundMenu': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'sidebar:spaceMenu': {
    input: z.object({ spaceId: tabId }).strict(),
    output: z.void(),
  },
  /** The sidebar's + button (Img 2): Arc's create popover, hanging above `anchor`. */
  'sidebar:createMenu': {
    input: z.object({ anchor: rectSchema }).strict(),
    output: z.void(),
  },
  /** A choice in the create popover. */
  'sidebar:create': {
    input: z
      .object({
        action: z.enum(['space', 'folder', 'easel', 'note', 'boost', 'split', 'tab']),
      })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'spaces:activate': {
    input: z.object({ spaceId: tabId }).strict(),
    output: z.void(),
  },
  'spaces:cycle': {
    input: z.object({ direction: z.union([z.literal(1), z.literal(-1)]) }).strict(),
    output: z.void(),
  },
  /** Moves a space to a profile ('new' creates one). Its pages reload in that profile. */
  'spaces:setProfile': {
    input: z.object({ spaceId: tabId, profileId: z.union([tabId, z.literal('new')]) }).strict(),
    output: z.object({ profileId: z.string() }),
  },
  'spaces:update': {
    input: z
      .object({
        spaceId: tabId,
        name: z.string().min(1).max(60).optional(),
        icon: z.string().min(1).max(40).optional(),
        theme: spaceThemeSchema.optional(),
      })
      .strict(),
    output: z.void(),
  },

  // Downloads shelf (F-10).
  'downloads:get': {
    input: z.object({}).strict(),
    output: downloadsSnapshotSchema,
  },
  /** The latest finished downloads still on disk (hovering the Library button). */
  'downloads:recent': {
    input: z.object({}).strict(),
    output: z.object({ items: z.array(recentDownloadSchema) }),
  },
  'downloads:act': {
    input: z
      .object({
        id: z.string().min(1).max(64),
        action: z.enum(['open', 'reveal', 'cancel', 'dismiss', 'drag']),
      })
      .strict(),
    output: z.void(),
  },

  // Sidebar mini player (F-09).
  'media:get': {
    input: z.object({}).strict(),
    output: mediaStateSchema,
  },
  'media:control': {
    input: z.object({ action: z.enum(['toggle', 'mute', 'pip', 'focus', 'close']) }).strict(),
    output: z.void(),
  },

  // Little Orbit (F-24) and default browser.
  'little:get': {
    input: z.object({}).strict(),
    output: z.object({ url: z.string(), title: z.string() }),
  },
  /** Little Orbit's address field: an address or a search. */
  'little:navigate': {
    input: z.object({ input: z.string().min(1).max(8192) }).strict(),
    output: z.void(),
  },
  'little:promote': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'browser:defaultStatus': {
    input: z.object({}).strict(),
    output: z.object({ isDefault: z.boolean() }),
    surfaces: ['internal'],
  },
  'browser:makeDefault': {
    input: z.object({}).strict(),
    output: z.object({ isDefault: z.boolean() }),
    surfaces: ['internal'],
  },

  // Command bar (F-21). The shell opens it; the overlay (where it renders) queries and executes.
  'commandbar:open': {
    input: z.object({ mode: commandBarModeSchema }).strict(),
    output: z.void(),
  },
  'commandbar:query': {
    input: z.object({ query: z.string().max(2048) }).strict(),
    output: z.object({ items: z.array(commandItemSchema) }),
    surfaces: ['overlay'],
  },
  'commandbar:execute': {
    input: z.object({ item: commandItemSchema }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  // Find in page (⌘F). The find bar is drawn in the shell's toolbar strip.
  'find:get': {
    input: z.object({}).strict(),
    output: findStateSchema,
  },
  'find:search': {
    input: z
      .object({ query: z.string().max(1000), direction: z.enum(['next', 'previous']).optional() })
      .strict(),
    output: z.void(),
  },
  'find:close': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  /** Site controls popover (F-12): the toolbar button, at `anchor` in window coordinates. */
  'sitecontrols:open': {
    input: z.object({ anchor: rectSchema }).strict(),
    output: z.void(),
  },
  'sitecontrols:close': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** A settings row was clicked: main shows its choices as a native menu (or sets `value`). */
  'sitecontrols:pick': {
    input: z
      .object({ key: z.string().min(1).max(64), value: z.string().max(32).optional() })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'sitecontrols:action': {
    input: z.object({ action: siteActionSchema }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** An extension's button in site controls: its popup / click, or (menu) its context menu. */
  'extensions:activate': {
    input: z
      .object({ id: z.string().regex(/^[a-p]{32}$/), anchor: rectSchema, menu: z.boolean() })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** "Add to Orbit" on a Chrome Web Store page (the ID comes from the active tab, not input). */
  'extensions:install': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** "+": the Chrome Web Store in a new tab. */
  'extensions:openStore': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  // Boosts (F-18). Site controls toggles and opens them; the editor page (orbit://boost/<id>)
  // may only read and change its own Boost.
  'boosts:toggle': {
    input: z.object({ id: boostIdSchema, enabled: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'boosts:edit': {
    input: z.object({ id: boostIdSchema }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'boosts:get': {
    input: z.object({ id: boostIdSchema }).strict(),
    output: boostSchema.nullable(),
    surfaces: ['internal'],
  },
  /** Saves an edit (applied live to matching pages); `error` explains a rejected domain. */
  'boosts:update': {
    input: z.object({ id: boostIdSchema, patch: boostPatchSchema }).strict(),
    output: z.object({ boost: boostSchema.nullable(), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  /** Asks to confirm, deletes the Boost and closes its editor. */
  'boosts:delete': {
    input: z.object({ id: boostIdSchema }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Zap mode on the matching page beside the editor. */
  'boosts:zap': {
    input: z.object({ id: boostIdSchema }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Reloads the pages a Boost applies to, so edited JS runs. */
  'boosts:reloadPages': {
    input: z.object({ id: boostIdSchema }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Area screenshot finished: `rect` in window coordinates, or null for the whole page. */
  'capture:take': {
    input: z.object({ rect: rectSchema.nullable() }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'capture:cancel': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** Developer Mode's toolbar button (F-30). */
  /** The sidebar address pill's link icon (Arc): copies the active page's address. */
  'tabs:copyUrl': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'tabs:devtools': {
    input: z.object({ tabId }).strict(),
    output: z.void(),
  },
  /** Peek (F-23): close the preview, or open its page as a tab without reloading. */
  'peek:close': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'peek:promote': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'overlay:get': {
    input: z.object({}).strict(),
    output: overlayStateSchema,
    surfaces: ['overlay'],
  },
  'overlay:answer': {
    input: promptAnswerSchema.strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'overlay:close': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },

  // Library (F-11). The shell's sidebar switches sections; the Library page (orbit://library/…,
  // shown in place of the pages) reads and acts on each section.
  'library:get': {
    input: z.object({}).strict(),
    output: libraryStateSchema,
  },
  'library:open': {
    input: z.object({ section: librarySectionSchema }).strict(),
    output: z.void(),
  },
  'library:close': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'library:media': {
    input: z.object({}).strict(),
    output: z.object({ items: z.array(mediaItemSchema) }),
    surfaces: ['internal'],
  },
  'library:mediaAct': {
    input: z.object({ id: mediaIdSchema, action: z.enum(['open', 'reveal']) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'library:downloads': {
    input: z.object({ query: z.string().max(500) }).strict(),
    output: z.object({ items: z.array(downloadEntrySchema) }),
    surfaces: ['internal'],
  },
  'library:downloadAct': {
    input: z.object({ id: z.string().min(1).max(64), action: z.enum(['open', 'reveal']) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'library:spaces': {
    input: z.object({}).strict(),
    output: z.object({ spaces: z.array(spaceEntrySchema) }),
    surfaces: ['internal'],
  },
  /** Open, move up or down, rename, or (after confirming) delete a space. */
  'library:spaceAct': {
    input: z
      .object({
        spaceId: tabId,
        action: z.enum(['open', 'up', 'down', 'rename', 'delete', 'menu']),
        name: z.string().min(1).max(60).optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** A new space (shown in Library → Spaces), or a space's tab opened from there. */
  'library:newSpace': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'library:openItem': {
    input: z.object({ itemId: tabId }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** The space theme as CSS variables, for the Library and Easels. */
  'appearance:get': {
    input: z.object({}).strict(),
    output: appearanceSchema,
    surfaces: ['internal'],
  },
  'library:boosts': {
    input: z.object({}).strict(),
    output: z.object({ boosts: z.array(boostEntrySchema) }),
    surfaces: ['internal'],
  },
  'library:boostAct': {
    input: z
      .object({ id: boostIdSchema, action: z.enum(['on', 'off', 'edit', 'delete']) })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },

  'library:easels': {
    input: z.object({}).strict(),
    output: z.object({ easels: z.array(easelEntrySchema) }),
    surfaces: ['internal'],
  },
  /** Open or (after confirming) delete an Easel, or make a new one. */
  'library:easelAct': {
    input: z
      .object({ id: easelIdSchema.optional(), action: z.enum(['new', 'open', 'delete']) })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },

  // Easels (F-19): the editor (orbit://easel/<id>) loads and saves only its own Easel.
  'easels:get': {
    input: z.object({ id: easelIdSchema }).strict(),
    output: easelSchema.nullable(),
    surfaces: ['internal'],
  },
  'easels:save': {
    input: z
      .object({
        id: easelIdSchema,
        title: z.string().min(1).max(120).optional(),
        // Captured and pasted images live in the scene, so it can be large.
        scene: z.string().max(80_000_000).optional(),
        preview: z
          .string()
          .max(2_000_000)
          .regex(/^data:image\/(jpeg|png);base64,/)
          .nullable()
          .optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Area capture from a web page in this window; null if cancelled. */
  'easels:capture': {
    input: z.object({ id: easelIdSchema }).strict(),
    output: easelCaptureSchema.nullable(),
    surfaces: ['internal'],
  },

  // Archived Tabs (orbit://archive) and Settings (orbit://settings): internal pages only.
  'archive:list': {
    input: z.object({ query: z.string().max(500) }).strict(),
    output: z.object({
      entries: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          url: z.string(),
          favicon: z.string().nullable(),
          reason: z.enum(['auto', 'closed', 'cleared']),
          archivedAt: z.number(),
          spaceId: z.string().nullable(),
        }),
      ),
      /** Spaces the entries came from (Arc's "Where was the tab?" filter). */
      spaces: z.array(z.object({ id: z.string(), name: z.string(), icon: z.string() })),
    }),
    surfaces: ['internal'],
  },
  'archive:delete': {
    input: z.object({ id: z.string().min(1).max(64) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'archive:restore': {
    input: z.object({ id: z.string().min(1).max(64) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'settings:get': {
    input: z.object({}).strict(),
    output: userSettingsSchema,
    surfaces: ['internal'],
  },
  'settings:set': {
    input: userSettingsSchema.partial().strict(),
    output: userSettingsSchema,
    surfaces: ['internal'],
  },
  /** The Anthropic API key for Tidy (Settings). The key itself is never sent back. */
  'ai:status': {
    input: z.object({}).strict(),
    output: z.object({ hasKey: z.boolean(), canStore: z.boolean(), model: z.string() }),
    surfaces: ['internal'],
  },
  'ai:setKey': {
    input: z.object({ key: z.string().min(1).max(300) }).strict(),
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  'ai:clearKey': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  // Profiles (F-17) in Settings: separate cookies, logins and history per profile.
  'profiles:list': {
    input: z.object({}).strict(),
    output: z.object({
      profiles: z.array(
        z.object({ id: z.string(), name: z.string(), isDefault: z.boolean(), spaces: z.number() }),
      ),
      spaces: z.array(
        z.object({ id: z.string(), name: z.string(), icon: z.string(), profileId: z.string() }),
      ),
    }),
    surfaces: ['internal'],
  },
  'profiles:create': {
    input: z.object({ name: z.string().min(1).max(40) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'profiles:rename': {
    input: z.object({ id: tabId, name: z.string().min(1).max(40) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Asks to confirm, then deletes an unused profile and its browsing data. */
  'profiles:delete': {
    input: z.object({ id: tabId }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Moves a space to a profile (its pages reload signed in as that profile). */
  'profiles:assign': {
    input: z.object({ spaceId: tabId, profileId: tabId }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Settings → About: the profile folder in Finder. */
  'app:revealData': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'history:clear': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },

  // New tab page (orbit://newtab). Only internal pages may call these.
  'newtab:get': {
    input: z.object({}).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  'newtab:setWallpaper': {
    input: z.object({ wallpaper: wallpaperChoiceSchema }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  /** Opens a file picker; resolves to the new state, or null if the user cancelled. */
  'newtab:chooseImage': {
    input: z.object({}).strict(),
    output: newTabStateSchema.nullable(),
    surfaces: ['internal'],
  },
  /** The page's theme, tagline and widgets. */
  'newtab:setHome': {
    input: z
      .object({
        theme: homeSettingsSchema.shape.theme.optional(),
        tagline: homeSettingsSchema.shape.tagline.optional(),
        show: homeSettingsSchema.shape.show.partial().optional(),
      })
      .strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  /** Your name for the greeting (saved on this tab's profile). */
  'newtab:setName': {
    input: z.object({ name: z.string().max(40) }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  'newtab:shortcut': {
    input: z.discriminatedUnion('action', [
      z
        .object({
          action: z.literal('add'),
          title: z.string().max(40),
          url: z.string().min(1).max(2048),
        })
        .strict(),
      z.object({ action: z.literal('remove'), id: z.string().max(64) }).strict(),
    ]),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  'newtab:todo': {
    input: z.discriminatedUnion('action', [
      z.object({ action: z.literal('add'), text: z.string().min(1).max(200) }).strict(),
      z.object({ action: z.enum(['toggle', 'remove']), id: z.string().max(64) }).strict(),
    ]),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  /** Loads what the user typed in the search box into the new tab page's own tab. */
  'newtab:navigate': {
    input: z.object({ input: z.string().min(1).max(8192) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },

  // Notes (F-33). The editor runs in a note's tab (orbit://note/<id>), the Notes panel, a
  // floating note window (all internal pages) and the quick-note card (overlay). Main checks
  // each sender is one of those.
  'notes:list': {
    input: z.object({ query: z.string().max(200).optional() }).strict(),
    output: z.object({ notes: z.array(noteEntrySchema) }),
    surfaces: ['internal', 'overlay'],
  },
  'notes:get': {
    input: z.object({ id: noteIdSchema }).strict(),
    output: noteSchema.nullable(),
    surfaces: ['internal', 'overlay'],
  },
  'notes:create': {
    /** `projectId`: the new note belongs to that project. */
    input: z.object({ projectId: z.string().max(64).optional() }).strict(),
    output: z.object({ id: noteIdSchema }),
    surfaces: ['internal', 'overlay'],
  },
  /** Saves the editor's document; returns its new version (null if the note was deleted). */
  'notes:save': {
    input: z
      .object({
        id: noteIdSchema,
        doc: z.string().max(NOTE_LIMITS.doc),
        text: z.string().max(NOTE_LIMITS.text),
      })
      .strict(),
    output: z.object({ updatedAt: z.number().nullable() }),
    surfaces: ['internal', 'overlay'],
  },
  /** The note's current version, so other open copies know to reload. */
  'notes:version': {
    input: z.object({ id: noteIdSchema }).strict(),
    output: z.object({ updatedAt: z.number().nullable() }),
    surfaces: ['internal', 'overlay'],
  },
  /** The editor is leaving this note: if nothing was written, the note goes. */
  'notes:discardIfBlank': {
    input: z.object({ id: noteIdSchema }).strict(),
    output: z.object({ deleted: z.boolean() }),
    surfaces: ['internal', 'overlay'],
  },
  /** Open the note in a tab, the panel or a floating window, or delete it (asks first). */
  'notes:act': {
    input: z.object({ id: noteIdSchema, action: noteActionSchema }).strict(),
    output: z.object({ done: z.boolean() }),
    surfaces: ['internal', 'overlay'],
  },
  /** ⌘-click on a link in a note: open it as a tab. */
  'notes:openUrl': {
    input: z.object({ url: z.string().max(8192) }).strict(),
    output: z.void(),
    surfaces: ['internal', 'overlay'],
  },
  /** The productivity panel: toggle (no `open`), open (on a note, or one of its tabs) or close. */
  'notes:panel': {
    input: z
      .object({
        open: z.boolean().optional(),
        id: noteIdSchema.optional(),
        view: z.enum(['notes', 'projects', 'tasks', 'board']).optional(),
        /** Open on this project's page. */
        projectId: z.string().max(64).optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** The quick-note card over the page: open (a new note) or close. */
  'notes:quick': {
    input: z.object({ open: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay'],
  },
  /** A floating note: keep it above other apps' windows (no `onTop` = just read it). */
  'notes:onTop': {
    input: z.object({ onTop: z.boolean().optional() }).strict(),
    output: z.object({ onTop: z.boolean() }),
    surfaces: ['internal'],
  },

  // The profile menu (owner request, like Wavebox's): the toolbar's avatar opens it.
  'profile:menu': {
    input: z.object({ anchor: rectSchema }).strict(),
    output: z.void(),
  },
  /** The active space's profile and every profile (with how many spaces use it). */
  'profile:get': {
    input: z.object({}).strict(),
    output: z.object({
      current: profileViewSchema,
      profiles: z.array(profileViewSchema.extend({ spaces: z.number() })),
    }),
    surfaces: ['overlay'],
  },
  'profile:update': {
    input: z.object({ id: z.string().min(1).max(64), patch: profilePatchSchema }).strict(),
    output: z.void(),
    surfaces: ['overlay', 'internal'],
  },
  /** Go to a space of that profile (a new one if it has none). */
  'profile:switch': {
    input: z.object({ id: z.string().min(1).max(64) }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** A new profile, with its first space, and switch to it. */
  'profile:create': {
    input: z.object({ name: z.string().min(1).max(40) }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** The menu's links. */
  'profile:open': {
    input: z
      .object({ page: z.enum(['settings', 'profiles', 'shortcuts', 'library', 'import']) })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },

  // Projects and tasks (owner request): the productivity panel's Projects, Tasks and Board.
  // Only the panel may call these. Every change answers with all the data, so its views stay
  // in step.
  'work:get': {
    input: z.object({}).strict(),
    output: workDataSchema,
    surfaces: ['internal'],
  },
  'work:saveProject': {
    input: projectInputSchema,
    output: z.object({ id: z.string(), data: workDataSchema }),
    surfaces: ['internal'],
  },
  'work:projectStatus': {
    input: z.object({ id: z.string().max(64), status: z.enum(PROJECT_STATUSES) }).strict(),
    output: workDataSchema,
    surfaces: ['internal'],
  },
  /** Asks first (delete its tasks too, or keep them); `deleted` false if cancelled. */
  'work:deleteProject': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.object({ deleted: z.boolean(), data: workDataSchema }),
    surfaces: ['internal'],
  },
  'work:saveTask': {
    input: taskInputSchema,
    output: z.object({ id: z.string(), data: workDataSchema }),
    surfaces: ['internal'],
  },
  'work:taskStatus': {
    input: z.object({ id: z.string().max(64), status: z.enum(TASK_STATUSES) }).strict(),
    output: workDataSchema,
    surfaces: ['internal'],
  },
  'work:deleteTask': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.object({ deleted: z.boolean(), data: workDataSchema }),
    surfaces: ['internal'],
  },
  /** A project's page was opened; `workspace` also switches to its Space. */
  'work:openProject': {
    input: z.object({ id: z.string().max(64), workspace: z.boolean() }).strict(),
    output: workDataSchema,
    surfaces: ['internal'],
  },
  /** The panel's page moved ('panel/projects/<id>'…), remembered for the next launch. */
  'notes:panelRoute': {
    input: z.object({ route: z.string().max(120) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Puts a note in a project, or none. */
  'notes:setProject': {
    input: z.object({ id: noteIdSchema, projectId: z.string().max(64).nullable() }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** The Project Board widens the panel while it shows. */
  'work:panelWide': {
    input: z.object({ wide: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },

  // Orbit Capture (roadmap P2.1). The card lives in the overlay; ⇧⌘S, the page's right-click
  // menu and the command bar open it (main reads the page — never the other way round).
  'capture:draft': {
    input: z.object({}).strict(),
    output: captureDraftSchema.nullable(),
    surfaces: ['overlay'],
  },
  /** The card's chips: the page/link, or the selection. */
  'capture:kind': {
    input: z.object({ kind: z.enum(['link', 'text']) }).strict(),
    output: captureDraftSchema.nullable(),
    surfaces: ['overlay'],
  },
  /** Area screenshot: the card steps aside, then comes back with it. */
  'capture:screenshot': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'capture:save': {
    input: z
      .object({
        projectId: z.string().max(64).nullable(),
        comment: z.string().max(CAPTURE_LIMITS.comment),
        makeTask: z.boolean(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'capture:close': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  // A project's research, in the productivity panel.
  'research:image': {
    input: z.object({ id: z.string().max(64), size: z.enum(['thumb', 'full']) }).strict(),
    output: z.object({ image: z.string().nullable() }),
    surfaces: ['internal'],
  },
  'research:move': {
    input: z.object({ id: z.string().max(64), projectId: z.string().max(64).nullable() }).strict(),
    output: workDataSchema,
    surfaces: ['internal'],
  },
  /** Asks first. */
  'research:delete': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.object({ deleted: z.boolean(), data: workDataSchema }),
    surfaces: ['internal'],
  },
  /** The quote, snippet, link or screenshot onto the clipboard. */
  'research:copy': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },

  // Arc-style tooltips for shell controls, drawn by the overlay so they show over pages.
  'tooltip:show': {
    input: z
      .object({
        label: z.string().min(1).max(80),
        keys: z.array(z.string().min(1).max(8)).max(5),
        anchor: rectSchema,
        side: z.enum(['top', 'bottom', 'right']),
      })
      .strict(),
    output: z.void(),
  },
  'tooltip:hide': {
    input: z.object({}).strict(),
    output: z.void(),
  },

  // Focus mode (roadmap P2.3): the toolbar's pill, a task's Focus button, the command bar.
  'focus:get': {
    input: z.object({}).strict(),
    output: focusSessionSchema.nullable(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'focus:start': {
    input: z
      .object({
        taskId: z.string().max(64).optional(),
        minutes: z.number().int().min(1).max(240).optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'focus:end': {
    input: z.object({ complete: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
} as const satisfies Record<string, ChannelSpec>;

export const events = {
  /** Sent to a window's shell whenever its layout changes. */
  'state:layout': layoutSchema,
  /** Sent to a window's shell whenever its tabs change. */
  'state:tabs': tabsSnapshotSchema,
  /** Sent to a window's shell whenever its sidebar (spaces, favorites, pinned, Today) changes. */
  'state:sidebar': sidebarSnapshotSchema,
  /** Sent to a window's overlay when floating UI opens or closes. */
  'state:overlay': overlayStateSchema,
  /** Sent to a window's shell when its mini player changes. */
  'state:media': mediaStateSchema,
  /** Sent to a Little Orbit window's bar when its page changes. */
  'little:state': z.object({ url: z.string(), title: z.string() }),
  /** Sent to every shell when downloads change. */
  'state:downloads': downloadsSnapshotSchema,
  /** Sent to a window's shell when Library mode opens, closes or changes section. */
  'state:library': libraryStateSchema,
  /** The focus session under way, or null (roadmap P2.3). */
  'state:focus': focusSessionSchema.nullable(),
  /** Sent to a window's shell when find-in-page changes. */
  'state:find': findStateSchema,
  /** Ask the shell to start inline renaming (a sidebar item, or the space header). */
  'rename:start': z.object({ target: z.enum(['item', 'space']), id: z.string(), at: z.number() }),
  /** A short confirmation in the toolbar ("Copied link"). */
  'toast:show': z.object({ message: z.string().max(200), at: z.number() }),
} as const satisfies Record<string, z.ZodType>;

export type Contract = typeof contract;
export type Channel = keyof Contract;
export type InvokeInput<C extends Channel> = z.input<Contract[C]['input']>;
export type InvokeOutput<C extends Channel> = z.output<Contract[C]['output']>;

export type Events = typeof events;
export type EventChannel = keyof Events;
export type EventPayload<E extends EventChannel> = z.output<Events[E]>;

export const CHANNEL_NAME_PATTERN = /^[a-z]+:[a-z][a-zA-Z]*$/;
