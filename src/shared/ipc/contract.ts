import { z } from 'zod';
import { layoutSchema } from '../types/layout';
import {
  commandBarModeSchema,
  commandItemSchema,
  overlayStateSchema,
  promptAnswerSchema,
} from '../types/command-bar';
import { findStateSchema } from '../types/find';
import { newTabStateSchema, wallpaperChoiceSchema } from '../types/newtab';
import { sidebarSnapshotSchema, spaceThemeSchema } from '../types/space';
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
  },
  'layout:get': {
    input: z.object({}).strict(),
    output: layoutSchema,
  },
  'sidebar:toggle': {
    input: z.object({}).strict(),
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
  'sidebar:spaceMenu': {
    input: z.object({ spaceId: tabId }).strict(),
    output: z.void(),
  },
  'sidebar:createMenu': {
    input: z.object({}).strict(),
    output: z.void(),
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
  /** Loads what the user typed in the search box into the new tab page's own tab. */
  'newtab:navigate': {
    input: z.object({ input: z.string().min(1).max(8192) }).strict(),
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
