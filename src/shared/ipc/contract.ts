import { z } from 'zod';
import { layoutSchema, rectSchema } from '../types/layout';
import { siteActionSchema } from '../types/site-controls';
import { boostIdSchema, boostPatchSchema, boostSchema } from '../types/boosts';
import {
  easelBackgroundSchema,
  easelCaptureSchema,
  easelEntrySchema,
  easelIdSchema,
  easelSchema,
} from '../types/easels';
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
import { accountViewSchema } from '../types/account';
import { mediaStateSchema, POPOUT_ACTIONS, popoutViewSchema } from '../types/media';
import { newTabStateSchema, wallpaperChoiceSchema } from '../types/newtab';
import { sidebarSnapshotSchema, spaceThemeSchema } from '../types/space';
import { userSettingsSchema } from '../settings';
import { profilePatchSchema, profileViewSchema } from '../profile';
import { homeSettingsSchema } from '../types/home';
import { CAPTURE_LIMITS, captureDraftSchema } from '../capture';
import { focusPrefsPatchSchema, focusSessionSchema, focusViewSchema } from '../focus';
import { soundIdSchema, soundStateSchema } from '../sounds';
import { uiPrefsPatchSchema, uiPrefsSchema } from '../ui-prefs';
import { canvasFrameSchema, canvasStateSchema } from '../types/canvas';
import { ORBIT_MENU_ACTIONS, orbitMenuViewSchema } from '../types/orbit-menu';
import { homeLayoutSchema, placeSchema, weatherSchema, widgetDataSchema } from '../home-widgets';
import { lookSchema, ROTATIONS, unsplashPhotoSchema } from '../backgrounds';
import { aliveAppSchema, appListSchema, appPanelStateSchema, OPEN_IN } from '../apps';
import {
  PROJECT_STATUSES,
  TASK_STATUSES,
  projectInputSchema,
  taskInputSchema,
  workDataSchema,
} from '../work';
import { tabsSnapshotSchema } from '../types/tabs';
import { aiActivitySchema, aiPrefsPatchSchema, aiPrefsSchema, aiUsageSchema } from '../ai';
import { ASSISTANT_LIMITS, assistantStateSchema, taskSuggestionSchema } from '../assistant';
import { TOOLKIT_SECTIONS, toolkitStateSchema, viewportSchema } from '../toolkit/state';
import { githubRepoViewSchema } from '../github';
import { ruleInputSchema, rulesSchema } from '../rules';
import { voicePrefsPatchSchema, voicePrefsSchema, voiceStateSchema } from '../voice';
import { driveStatusSchema } from '../drive';

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
  /** The right-hand dock (Notes or a docked app): its edge dragged to `width`. */
  'dock:setWidth': {
    /** `app`: the pinned app beside the rail (UI 3); otherwise the dock on the right. */
    input: z
      .object({ width: z.number().finite(), dock: z.enum(['right', 'app']).optional() })
      .strict(),
    output: z.void(),
  },
  /** Dock edge drag: the page and the dock's page hide meanwhile (like the sidebar's edge);
   *  the shell shows the page's snapshot instead. */
  'dock:beginResize': {
    input: z.object({}).strict(),
    output: z.object({ snapshot: z.string().nullable() }),
  },
  'dock:endResize': {
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
    /** `rail`: from the app rail, where apps open beside the page (Opera's sidebar). */
    input: z.object({ tabId, from: z.enum(['rail']).optional() }).strict(),
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
  /** Group Tabs (roadmap R2 M4): the preview of folders for this Space's loose Today tabs. */
  'grouping:open': {
    input: z.object({}).strict(),
    output: z.void(),
  },
  'grouping:apply': {
    input: z
      .object({
        groups: z
          .array(
            z
              .object({
                name: z.string().max(80),
                tabIds: z.array(z.string().max(64)).max(300),
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'grouping:dismiss': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
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
  /** Right-click on the toolbar row, the tab row or the rail: tab layout, sidebar, new tab. */
  'toolbar:menu': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell'],
  },
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
    input: z
      .object({
        action: z.enum(['toggle', 'mute', 'pip', 'focus', 'close', 'previous', 'next']),
      })
      .strict(),
    output: z.void(),
  },
  // Orbit accounts and cloud sync (docs/FIREBASE.md). Settings drives them; main holds the
  // session — pages only ever get the account's email and sync state, never a token.
  'account:get': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal', 'overlay'],
  },
  'account:signIn': {
    input: z.object({ email: z.string().trim().max(254), password: z.string().max(200) }).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  'account:signUp': {
    input: z.object({ email: z.string().trim().max(254), password: z.string().max(200) }).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  /** Opens Google in your browser; answers once you've chosen your account there. */
  'account:google': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  'account:cancelGoogle': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'account:resetPassword': {
    input: z.object({ email: z.string().trim().max(254) }).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  'account:resendVerification': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  /** "I've opened the link": checks with Firebase. */
  'account:checkVerification': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  'account:signOut': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  'account:syncNow': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  /** Asks first (a native dialog); `password` re-confirms an email account if needed. */
  'account:delete': {
    input: z.object({ password: z.string().max(200).nullable() }).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  /** Clears the notice (and the "kept both versions" count) once read. */
  'account:dismiss': {
    input: z.object({}).strict(),
    output: accountViewSchema,
    surfaces: ['internal'],
  },
  /** The video pop-out's buttons: minimize, back to the video's tab, close, play/pause. */
  'popout:action': {
    input: z.object({ action: z.enum(POPOUT_ACTIONS) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'popout:get': {
    input: z.object({}).strict(),
    output: popoutViewSchema.nullable(),
    surfaces: ['internal'],
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
    /** `split`: ⌥⏎ — beside the current page, in split view (roadmap P2.4). `voice`: the words
     *  were spoken (Orbit AI may read its answer aloud). */
    input: z
      .object({
        item: commandItemSchema,
        split: z.boolean().optional(),
        voice: z.boolean().optional(),
      })
      .strict(),
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
  /** The toolbar's screenshot button (⇧⌘2): drag an area of the page, or click for all of it. */
  'shot:start': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell'],
  },
  /** What to do with the screenshot just taken (its card in the overlay). */
  'shot:action': {
    input: z.object({ action: z.enum(['copy', 'save', 'saveAs', 'easel', 'dismiss']) }).strict(),
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
  /** Peek's split button: the page beside the one it came from, in split view. */
  'peek:split': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** Back, forward or reload inside the preview. */
  'peek:navigate': {
    input: z.object({ action: z.enum(['back', 'forward', 'reload']) }).strict(),
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
  /** Behind the drawing: plain, grid or dots. */
  'easels:background': {
    input: z.object({ id: easelIdSchema, background: easelBackgroundSchema }).strict(),
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
  /** App Hub (brief M5): the docked app panel — its state, and its header's buttons. */
  'apps:panelState': {
    input: z.object({}).strict(),
    output: appPanelStateSchema.nullable(),
    surfaces: ['shell', 'overlay'],
  },
  /** The sidebar apps running out of sight (the rail marks them, and those playing sound). */
  'apps:alive': {
    input: z.object({}).strict(),
    output: z.array(aliveAppSchema),
    surfaces: ['shell'],
  },
  'apps:panel': {
    input: z
      .object({
        // manage: Settings → Apps (the switcher's +); openInWindow: its own small window
        action: z.enum([
          'close',
          'back',
          'forward',
          'reload',
          'openAsTab',
          'openInWindow',
          'manage',
          // Pin beside the page, or float over it; stop the app (it's kept running otherwise).
          'pin',
          'unpin',
          'quit',
        ]),
      })
      .strict(),
    output: z.void(),
    // The shell's header, or the overlay's when the app floats.
    surfaces: ['shell', 'overlay'],
  },
  /** The App Library (redesign brief §7): open it; open an app; add one from the catalogue. */
  'applib:open': {
    input: z.object({}).strict(),
    output: z.void(),
    // The rail's +, the command bar, and the Homepage dock's launcher.
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'applib:launch': {
    input: z.object({ itemId: z.string().max(64) }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'applib:add': {
    input: z
      .object({ url: z.string().min(1).max(2000), title: z.string().max(120).optional() })
      .strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'applib:close': {
    input: z.object({ settings: z.boolean().optional() }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** Settings → Apps: your favourites as apps, and the Spaces they can show in. */
  'apps:list': {
    input: z.object({}).strict(),
    output: appListSchema,
    surfaces: ['internal'],
  },
  'apps:add': {
    input: z
      .object({ url: z.string().min(1).max(2000), title: z.string().max(120).optional() })
      .strict(),
    output: appListSchema,
    surfaces: ['internal'],
  },
  'apps:update': {
    input: z
      .object({
        itemId: z.string().max(64),
        title: z.string().max(120).optional(),
        openIn: z.enum(OPEN_IN).optional(),
        spaces: z.array(z.string().max(64)).max(50).nullable().optional(),
      })
      .strict(),
    output: appListSchema,
    surfaces: ['internal'],
  },
  'apps:remove': {
    input: z.object({ itemId: z.string().max(64) }).strict(),
    output: appListSchema,
    surfaces: ['internal'],
  },
  /** The customization engine (brief M2): every part of Orbit reads these. */
  'ui:get': {
    input: z.object({}).strict(),
    output: uiPrefsSchema,
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** The window's canvas: the wallpaper and the theme taken from it (UI spec §4). */
  'canvas:get': {
    input: z.object({}).strict(),
    output: canvasStateSchema,
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** Where this Orbit page's view sits in its window (the Homepage lines its wallpaper up). */
  'canvas:place': {
    input: z.object({}).strict(),
    output: canvasFrameSchema.nullable(),
    surfaces: ['internal'],
  },
  /** Settings → Appearance: the wallpaper, and how much to dim a photo (only Settings may). */
  'canvas:setWallpaper': {
    input: z.object({ wallpaper: wallpaperChoiceSchema }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'canvas:setDim': {
    input: z.object({ overlay: z.number().min(0).max(80) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Settings → Appearance changes them (only Settings may). */
  'ui:set': {
    input: uiPrefsPatchSchema,
    output: uiPrefsSchema,
    surfaces: ['internal'],
  },
  /** The sun/moon button and ⌘T: light ↔ dark for the whole app (Settings → Appearance). */
  'appearance:toggle': {
    input: z.object({}).strict(),
    output: z.enum(['light', 'dark']),
    surfaces: ['shell', 'overlay', 'internal'],
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
    output: z.object({
      hasKey: z.boolean(),
      canStore: z.boolean(),
      /** Tidy's model (the assistant's is in prefs). */
      model: z.string(),
      prefs: aiPrefsSchema,
      usage: aiUsageSchema,
    }),
    surfaces: ['internal'],
  },
  /** Settings → AI (roadmap P3.7): on/off, model, monthly limit, attaching the page. */
  'ai:setPrefs': {
    input: aiPrefsPatchSchema,
    output: z.void(),
    surfaces: ['internal'],
  },
  /** What was sent to Claude, newest first (metadata only), and this month's totals. */
  'ai:activity': {
    input: z.object({}).strict(),
    output: z.object({ entries: z.array(aiActivitySchema), usage: aiUsageSchema }),
    surfaces: ['internal'],
  },
  'ai:clearActivity': {
    input: z.object({}).strict(),
    output: z.void(),
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
  /** Background adjustments, favourites and rotation (brief M4). */
  'newtab:setLook': {
    input: z.object({ look: lookSchema }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  'newtab:favorite': {
    input: z.object({ wallpaper: wallpaperChoiceSchema, on: z.boolean() }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  'newtab:setRotation': {
    input: z.object({ rotation: z.enum(ROTATIONS) }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  /** Unsplash photos for what you typed (needs the owner's access key). */
  'newtab:unsplashSearch': {
    input: z
      .object({ query: z.string().min(1).max(80), page: z.number().int().min(1).max(50) })
      .strict(),
    output: z.object({ photos: z.array(unsplashPhotoSchema), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  /** Settings → Integrations: the Unsplash access key (kept in the Keychain, never sent back). */
  'unsplash:status': {
    input: z.object({}).strict(),
    output: z.object({ hasKey: z.boolean(), canStore: z.boolean() }),
    surfaces: ['internal'],
  },
  'unsplash:setKey': {
    input: z.object({ key: z.string().min(1).max(200) }).strict(),
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  'unsplash:clearKey': {
    input: z.object({}).strict(),
    output: z.void(),
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
  /** The Homepage's widgets: their order, sizes and settings (brief M3). */
  'newtab:setLayout': {
    input: z.object({ layout: homeLayoutSchema }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  /** This Space gets its own layout (starting from the current one), or goes back to the
   *  one every Space shares. */
  'newtab:layoutScope': {
    input: z.object({ scope: z.enum(['all', 'space']) }).strict(),
    output: newTabStateSchema,
    surfaces: ['internal'],
  },
  /** What the Projects, Notes and Recently Visited widgets show. */
  'newtab:widgetData': {
    input: z.object({}).strict(),
    output: widgetDataSchema,
    surfaces: ['internal'],
  },
  /** Weather: cities matching a name (Open-Meteo), then a city's weather. */
  'newtab:findPlace': {
    input: z.object({ query: z.string().min(1).max(80) }).strict(),
    output: z.array(placeSchema),
    surfaces: ['internal'],
  },
  'newtab:weather': {
    input: z.object({ place: placeSchema, units: z.enum(['c', 'f']) }).strict(),
    output: weatherSchema,
    surfaces: ['internal'],
  },
  /** A widget's item: a note (as a tab) or a project (in the panel). */
  'newtab:open': {
    /** note / project / app (a favourite, where it's set to open) / space (switch to it) /
     *  settings (a section of Settings). */
    input: z
      .object({
        kind: z.enum(['note', 'project', 'app', 'space', 'settings']),
        id: z.string().min(1).max(64),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** The Homepage's Ask Orbit widget: the question goes to Orbit AI (the panel opens). */
  'newtab:ask': {
    input: z.object({ text: z.string().min(1).max(4000) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** The Homepage's Google Drive widget: files edited lately (null: Drive isn't connected). */
  'newtab:driveRecent': {
    input: z.object({}).strict(),
    output: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          kind: z.string(),
          edited: z.string(),
          url: z.string(),
        }),
      )
      .nullable(),
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
  /** The toolbar's "Orbit ⌄" opens (or closes) the Orbit menu (UI spec §5). */
  'orbitmenu:open': {
    input: z.object({ anchor: rectSchema }).strict(),
    output: z.void(),
    surfaces: ['shell'],
  },
  /** The Orbit menu closes (a click outside it, or Esc). */
  'orbitmenu:close': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  /** What the Orbit menu lists: your Spaces and sync's state. */
  'orbitmenu:get': {
    input: z.object({}).strict(),
    output: orbitMenuViewSchema,
    surfaces: ['overlay'],
  },
  /** One of the Orbit menu's items (the menu closes). */
  'orbitmenu:run': {
    input: z
      .object({ action: z.enum(ORBIT_MENU_ACTIONS), spaceId: z.string().max(64).optional() })
      .strict(),
    output: z.void(),
    // The overlay's menu, and the sidebar's Add Space row.
    surfaces: ['overlay', 'shell'],
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
    // The profile menu, and the sidebar's Settings button (owner request).
    surfaces: ['overlay', 'shell'],
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
  /** Tasks out to other services (roadmap P4.3): a save dialog for CSV or a Markdown checklist. */
  'work:exportTasks': {
    input: z
      .object({ projectId: z.string().max(64).nullable(), format: z.enum(['csv', 'md']) })
      .strict(),
    output: z.object({ saved: z.boolean() }),
    surfaces: ['internal'],
  },
  /** …and in: an open dialog for CSV, Markdown or a plain list. */
  'work:importTasks': {
    input: z.object({ projectId: z.string().max(64).nullable() }).strict(),
    output: z.object({ imported: z.number().int(), data: workDataSchema }),
    surfaces: ['internal'],
  },
  /** Save as Template (roadmap P4.1): the project's tasks become a template for new projects. */
  'work:saveProjectTemplate': {
    input: z.object({ projectId: z.string().max(64), name: z.string().max(60) }).strict(),
    output: workDataSchema,
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
  /** The toolbar's Save to Orbit button (⇧⌘S): the capture card for the page you're on. */
  'capture:open': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell'],
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
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'tooltip:hide': {
    surfaces: ['shell', 'overlay', 'internal'],
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
        /** A task; null: no task (just time); absent: the next task of your last project. */
        taskId: z.string().max(64).nullable().optional(),
        minutes: z.number().int().min(1).max(240).optional(),
        /** A break (after a session) instead of focus. */
        kind: z.enum(['focus', 'break']).optional(),
        /** Block distracting sites (default: your preference). */
        block: z.boolean().optional(),
        /** Play this sound with it (default: your preference; null: none). */
        sound: soundIdSchema.nullable().optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** Pause or resume the session's clock. */
  'focus:pause': {
    input: z.object({ paused: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** Start the session's clock over (same task, same length). */
  'focus:restart': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** Keep going: a few more minutes on the session. */
  'focus:extend': {
    input: z.object({ minutes: z.number().int().min(1).max(60) }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** The panel's Focus view (toolbar button, menu, ⌘T). */
  'focus:open': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'focus:view': {
    input: z.object({}).strict(),
    output: focusViewSchema,
    surfaces: ['internal'],
  },
  'focus:setPrefs': {
    input: focusPrefsPatchSchema,
    output: focusViewSchema,
    surfaces: ['internal'],
  },
  /** "Open Anyway" on a site blocked during focus: allowed for the rest of the session. */
  'focus:allow': {
    input: z.object({ url: z.string().url().max(4096) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Google Drive, read-only (roadmap R2 M3): Settings → Integrations. */
  'drive:status': {
    input: z.object({}).strict(),
    output: driveStatusSchema,
    surfaces: ['internal'],
  },
  'drive:connect': {
    input: z.object({}).strict(),
    output: driveStatusSchema,
    surfaces: ['internal'],
  },
  'drive:cancel': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'drive:disconnect': {
    input: z.object({}).strict(),
    output: driveStatusSchema,
    surfaces: ['internal'],
  },
  /** Voice (roadmap R2 M2): push-to-talk. The command bar's microphone, ⇧⌘Space. */
  'voice:get': {
    input: z.object({}).strict(),
    output: voiceStateSchema,
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** Start listening (opening the command bar, or the voice popup, or into the assistant), or
   *  finish now if listening. */
  'voice:toggle': {
    input: z.object({ target: z.enum(['bar', 'popup', 'panel']).optional() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'voice:cancel': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  /** The one-time speech model download (the user agreed). */
  'voice:download': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay', 'internal'],
  },
  /** System Settings → Privacy & Security → Microphone. */
  'voice:micSettings': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay', 'internal'],
  },
  /** The voice popup (overlay): close it; continue in the assistant panel; reading aloud. */
  'voicepop:close': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'voicepop:panel': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'voicepop:speaking': {
    input: z.object({ speaking: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['overlay', 'internal'],
  },
  /** Settings → Voice. */
  'voice:settings': {
    input: z.object({}).strict(),
    /** quiet: test runs (answers are "read" at no volume). */
    output: z.object({
      prefs: voicePrefsSchema,
      modelReady: z.boolean(),
      modelBytes: z.number(),
      quiet: z.boolean(),
      wakeListening: z.boolean(),
    }),
    surfaces: ['internal'],
  },
  'voice:setPrefs': {
    input: voicePrefsPatchSchema,
    /** wakeError: "Hey Orbit" couldn't start (no model yet, or no microphone). */
    output: voicePrefsSchema.extend({ wakeError: z.string().nullable().optional() }),
    // The toolbar's "Hey Orbit" indicator turns it off.
    surfaces: ['internal', 'overlay', 'shell'],
  },
  'voice:removeModel': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** From the hidden voice page only: what it's doing, and what was said. */
  'voice:hostEvent': {
    input: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('wake'), rest: z.string().max(2000) }).strict(),
      z.object({ kind: z.literal('wakeState'), listening: z.boolean() }).strict(),
      z.object({ kind: z.literal('loading') }).strict(),
      z.object({ kind: z.literal('listening') }).strict(),
      z.object({ kind: z.literal('level'), rms: z.number().min(0).max(2) }).strict(),
      z.object({ kind: z.literal('transcribing') }).strict(),
      z.object({ kind: z.literal('result'), text: z.string().max(5000) }).strict(),
      z
        .object({
          kind: z.literal('error'),
          message: z.string().max(300),
          micDenied: z.boolean().optional(),
        })
        .strict(),
    ]),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** From the hidden voice page only: one of the speech model's files. */
  'voice:modelFile': {
    input: z.object({ path: z.string().max(200) }).strict(),
    output: z.custom<Uint8Array>((v) => v instanceof Uint8Array),
    surfaces: ['internal'],
  },
  /** Focus and calming sounds, generated on the Mac (src/shared/sounds.ts). */
  'sounds:get': {
    input: z.object({}).strict(),
    output: soundStateSchema,
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'sounds:play': {
    input: z.object({ id: soundIdSchema }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'sounds:stop': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'sounds:pause': {
    input: z.object({ paused: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'sounds:volume': {
    input: z.object({ volume: z.number().min(0).max(1) }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },
  'focus:end': {
    input: z.object({ complete: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'overlay', 'internal'],
  },

  // Workspace templates (roadmap P2.5), managed in Settings → Workspaces.
  'templates:list': {
    input: z.object({}).strict(),
    output: z.object({
      templates: z.array(
        z.object({ id: z.string(), name: z.string(), icon: z.string(), tabs: z.number() }),
      ),
    }),
    surfaces: ['internal'],
  },
  'templates:rename': {
    input: z.object({ id: z.string().max(64), name: z.string().min(1).max(60) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Asks first. */
  'templates:delete': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.object({ deleted: z.boolean() }),
    surfaces: ['internal'],
  },
  // The assistant (roadmap P3.1–P3.4) in the productivity panel. Opened from the toolbar,
  // the command bar, menus and a page's right-click menu; everything else comes from the panel.
  'assistant:open': {
    input: z.object({ summarize: z.boolean().optional() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'internal'],
  },
  'assistant:get': {
    input: z.object({}).strict(),
    output: assistantStateSchema,
    surfaces: ['internal'],
  },
  /** Sends a question with what's attached (or asks for a summary of the page). */
  'assistant:ask': {
    input: z
      .object({
        text: z.string().max(ASSISTANT_LIMITS.question),
        action: z.enum(['ask', 'summarize']),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'assistant:stop': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** A new conversation. */
  'assistant:clear': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Attach or detach the page, drop the selection, pick or drop saved research. */
  'assistant:attach': {
    input: z
      .object({
        page: z.boolean().optional(),
        selection: z.null().optional(),
        research: z
          .object({
            projectId: z.string().max(64).nullable(),
            captureIds: z.array(z.string().max(64)).max(ASSISTANT_LIMITS.captures),
          })
          .strict()
          .nullable()
          .optional(),
        /** Other open tabs to send too (compare pages). */
        tabs: z.array(z.string().max(64)).max(4).optional(),
        /** A project to share (null: stop sharing it). */
        project: z.string().max(64).nullable().optional(),
        /** Let this conversation look at and change your projects and tasks. */
        work: z.boolean().optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Shows where an answer's source `n` came from (scrolls the page, or opens the finding). */
  'assistant:source': {
    input: z
      .object({ messageId: z.string().max(64), n: z.number().int().min(1).max(500) })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** A link Orbit AI offered instead of opening it: open it (by its place in the answer). */
  'assistant:openLink': {
    input: z
      .object({ messageId: z.string().max(64), index: z.number().int().min(0).max(50) })
      .strict(),
    output: z.boolean(),
    surfaces: ['internal'],
  },
  'assistant:toNote': {
    input: z.object({ messageId: z.string().max(64) }).strict(),
    output: z.object({ noteId: z.string().nullable() }),
    surfaces: ['internal'],
  },
  'assistant:suggestTasks': {
    input: z.object({ from: z.enum(['selection', 'page']) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'assistant:addTasks': {
    input: z
      .object({
        projectId: z.string().max(64).nullable(),
        tasks: z.array(taskSuggestionSchema).min(1).max(20),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'assistant:dismissTasks': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  // The Toolkit (roadmap P3.5, P3.6) in the productivity panel: colours, contrast, images, CSS,
  // JSON and developer tools. Local only.
  'toolkit:get': {
    input: z.object({}).strict(),
    output: toolkitStateSchema,
    surfaces: ['internal'],
  },
  'toolkit:open': {
    input: z.object({ section: z.enum(TOOLKIT_SECTIONS).optional() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'internal'],
  },
  /** Pick Color: the page under a loupe in the overlay. */
  'toolkit:pickColor': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell', 'internal'],
  },
  'toolkit:colorPicked': {
    input: z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'toolkit:cancelPick': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['overlay'],
  },
  'toolkit:clearColors': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** The colours the page you're on uses. */
  'toolkit:palette': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** The fonts the page you're on uses (roadmap P4.6). */
  'toolkit:fonts': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Looks for local development servers. */
  'toolkit:servers': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Responsive mode for the page you're on (null: off). */
  'toolkit:viewport': {
    input: z.object({ viewport: viewportSchema.nullable() }).strict(),
    output: z.void(),
    surfaces: ['shell', 'internal'],
  },
  /** Annotate Screenshot: drag over the page; it opens on a new Easel. */
  'toolkit:annotate': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['shell', 'internal'],
  },
  /** Opens a (local) address beside the page you're on. */
  'toolkit:split': {
    input: z.object({ url: z.string().max(2048) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** An Easel started from Annotate Screenshot asks for its picture once. */
  'easels:pending': {
    input: z.object({ id: easelIdSchema }).strict(),
    output: easelCaptureSchema.nullable(),
    surfaces: ['internal'],
  },
  // Settings → Workspaces: your project templates (roadmap P4.1).
  'templates:projects': {
    input: z.object({}).strict(),
    output: z.object({
      templates: z.array(
        z.object({ id: z.string(), name: z.string(), tasks: z.number(), builtIn: z.boolean() }),
      ),
    }),
    surfaces: ['internal'],
  },
  'templates:renameProject': {
    input: z.object({ id: z.string().max(64), name: z.string().min(1).max(60) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  /** Asks first. */
  'templates:deleteProject': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  // GitHub (roadmap P4.2): a project's repository, and an optional token in Settings.
  'github:repo': {
    input: z.object({ projectId: z.string().max(64), refresh: z.boolean().optional() }).strict(),
    output: githubRepoViewSchema.nullable(),
    surfaces: ['internal'],
  },
  'github:status': {
    input: z.object({}).strict(),
    output: z.object({ hasToken: z.boolean(), canStore: z.boolean() }),
    surfaces: ['internal'],
  },
  'github:setToken': {
    input: z.object({ token: z.string().min(1).max(400) }).strict(),
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  'github:clearToken': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  // Settings → Rules (roadmap P4.4): where links from other apps go; a Space's own archive time.
  'rules:list': {
    input: z.object({}).strict(),
    output: z.object({
      rules: rulesSchema,
      spaces: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
    surfaces: ['internal'],
  },
  'rules:add': {
    input: ruleInputSchema,
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  'rules:toggle': {
    input: z.object({ id: z.string().max(64), enabled: z.boolean() }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'rules:delete': {
    input: z.object({ id: z.string().max(64) }).strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  // Settings → Backup (roadmap P4.7): one-file backups to a folder you choose, and restoring.
  'backup:status': {
    input: z.object({}).strict(),
    output: z.object({
      auto: z.object({ folder: z.string(), keep: z.number() }).nullable(),
      last: z.number().nullable(),
      encrypted: z.boolean(),
      canStore: z.boolean(),
      error: z.string().nullable(),
      restorePending: z.boolean(),
    }),
    surfaces: ['internal'],
  },
  /** A save dialog, then the backup. */
  'backup:now': {
    input: z.object({}).strict(),
    output: z.object({ file: z.string().nullable(), bytes: z.number() }),
    surfaces: ['internal'],
  },
  /** Automatic backups: choose the folder (an open dialog), or change how many, or turn off. */
  'backup:auto': {
    input: z
      .object({
        action: z.enum(['choose', 'keep', 'off']),
        keep: z.number().int().min(1).max(60).optional(),
      })
      .strict(),
    output: z.void(),
    surfaces: ['internal'],
  },
  'backup:passphrase': {
    input: z.object({ passphrase: z.string().max(200).nullable() }).strict(),
    output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    surfaces: ['internal'],
  },
  /**
   * Restore: an open dialog (the first time), then the backup is staged for the next start —
   * or, for an encrypted one, `passphrase` is asked for and sent back here.
   */
  'backup:restore': {
    input: z.object({ passphrase: z.string().max(200).optional() }).strict(),
    output: z.object({
      status: z.enum(['cancelled', 'passphrase', 'ready', 'error']),
      message: z.string().nullable(),
    }),
    surfaces: ['internal'],
  },
  'backup:cancelRestore': {
    input: z.object({}).strict(),
    output: z.void(),
    surfaces: ['internal'],
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
  /** The assistant's conversation, sent to its window's productivity panel. */
  'assistant:update': assistantStateSchema,
  /** The Toolkit's state, sent to its window's productivity panel. */
  'toolkit:update': toolkitStateSchema,
  /** The Focus view (session, preferences, sound), sent to every productivity panel. */
  'focus:update': focusViewSchema,
  /** What to play, sent to the hidden page that plays Orbit's sounds. */
  'sounds:update': soundStateSchema,
  /** The account and sync state, sent to Settings. */
  'account:update': accountViewSchema,
  /** The video pop-out's state, sent to its controls page. */
  'popout:update': popoutViewSchema,
  /** What's playing, sent to every shell (the toolbar's Focus button). */
  'state:sounds': soundStateSchema,
  /** The docked app panel (null: closed), sent to its window's shell. */
  'state:appPanel': appPanelStateSchema.nullable(),
  /** The sidebar apps running, sent to its window's shell. */
  'state:appsAlive': z.array(aliveAppSchema),
  /** The customization preferences, sent to every shell and overlay. */
  'state:ui': uiPrefsSchema,
  /** Google Drive's connection, sent to Settings. */
  'drive:update': driveStatusSchema,
  /** Voice (listening, transcribing…), sent to every shell and overlay. */
  'state:voice': voiceStateSchema,
  /** …and to each productivity panel (its assistant has a microphone). */
  'voice:update': voiceStateSchema,
  /** What the hidden voice page should do. */
  'voice:command': z.object({
    command: z.enum([
      'start',
      'stop',
      'cancel',
      'wake-on',
      'wake-off',
      'wake-pause',
      'wake-resume',
    ]),
    at: z.number(),
  }),
  /** …and to every Orbit page (Settings, the Homepage, the panel). */
  'ui:update': uiPrefsSchema,
  /** The canvas (wallpaper and its theme), sent to every shell and overlay… */
  'state:canvas': canvasStateSchema,
  /** …and to every Orbit page (without your own image: they don't draw the canvas). */
  'canvas:update': canvasStateSchema,
  /** Where a Homepage's view sits in its window, so its wallpaper lines up with the canvas. */
  'canvas:frame': canvasFrameSchema,
} as const satisfies Record<string, z.ZodType>;

export type Contract = typeof contract;
export type Channel = keyof Contract;
export type InvokeInput<C extends Channel> = z.input<Contract[C]['input']>;
export type InvokeOutput<C extends Channel> = z.output<Contract[C]['output']>;

export type Events = typeof events;
export type EventChannel = keyof Events;
export type EventPayload<E extends EventChannel> = z.output<Events[E]>;

export const CHANNEL_NAME_PATTERN = /^[a-z]+:[a-z][a-zA-Z]*$/;

/** The events internal orbit:// pages may listen to (main sends them to one page only). */
export const INTERNAL_EVENTS = [
  'voice:update',
  'drive:update',
  'voice:command',
  'assistant:update',
  'toolkit:update',
  'focus:update',
  'sounds:update',
  'ui:update',
  'canvas:update',
  'canvas:frame',
  'popout:update',
  'account:update',
] as const;
export type InternalEventChannel = (typeof INTERNAL_EVENTS)[number];
