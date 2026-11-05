import { z } from 'zod';
import { rectSchema } from './layout';
import { siteControlsViewSchema } from './site-controls';

/** One row in the command bar (F-21). Main builds and ranks these; the overlay just draws them. */
export const commandItemSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'navigate',
    'search',
    'tab',
    'history',
    'suggestion',
    'command',
    'project',
    'task',
    'note',
    'capture',
    'archived',
    /** Orbit AI: ask this (the words typed or spoken). */
    'ask',
    /** A file in your Google Drive (opens in its Google app). */
    'drive',
  ]),
  title: z.string(),
  subtitle: z.string(),
  favicon: z.string().nullable(),
  /** navigate / search / history / suggestion */
  url: z.string().optional(),
  /** tab */
  tabId: z.string().optional(),
  /** command */
  commandId: z.string().optional(),
  /** project / task / note: what to open in the productivity panel */
  targetId: z.string().optional(),
  /** task: its project (opens there), if any */
  projectId: z.string().optional(),
});
export type CommandItem = z.output<typeof commandItemSchema>;

export const commandBarModeSchema = z.enum(['new', 'edit']);
export type CommandBarMode = z.output<typeof commandBarModeSchema>;

/** A question the overlay asks on a site's behalf (F-31): permission, or HTTP sign-in. */
export const promptSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.number(),
    kind: z.literal('permission'),
    origin: z.string(),
    /** "use your camera", "show notifications"… */
    action: z.string(),
  }),
  z.object({ id: z.number(), kind: z.literal('login'), host: z.string(), realm: z.string() }),
  /** A line of text for Orbit itself (e.g. a Live Folder's feed address). */
  z.object({
    id: z.number(),
    kind: z.literal('input'),
    title: z.string(),
    message: z.string(),
    placeholder: z.string(),
    confirm: z.string(),
  }),
]);
export type Prompt = z.output<typeof promptSchema>;

export const promptAnswerSchema = z.object({
  id: z.number(),
  /** permission: allow or block. login: false = cancel. */
  allow: z.boolean(),
  remember: z.boolean().optional(),
  username: z.string().max(1000).optional(),
  password: z.string().max(1000).optional(),
  /** input: what was typed. */
  value: z.string().max(2000).optional(),
});
export type PromptAnswer = z.output<typeof promptAnswerSchema>;

/** What the overlay should show. More floating UI joins this in later phases. */
/** The Peek preview (F-23): the overlay draws the frame and header; main places the page. */
export const peekViewSchema = z.object({
  url: z.string(),
  title: z.string(),
  favicon: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean().default(false),
  canGoForward: z.boolean().default(false),
  frame: rectSchema,
  /** The part of the window the Peek dims (the page area, not the sidebar, which stays usable). */
  cover: rectSchema,
  headerHeight: z.number(),
  radius: z.number(),
});
export type PeekView = z.output<typeof peekViewSchema>;

export const overlayStateSchema = z.object({
  peek: peekViewSchema.nullable(),
  /** Where the overlay's top-left corner sits in the window (it can cover just part of it). */
  origin: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  /** A small copy of the page under the overlay, which glass surfaces blur behind themselves
   *  (native web views can't be blurred by CSS). `rect` is where the page sits in the window. */
  backdrop: z.object({ image: z.string(), rect: rectSchema }).nullable(),
  /** A download just started: its badge flies from the page into the sidebar's shelf (Arc). */
  flight: z
    .object({
      from: z.object({ x: z.number(), y: z.number() }),
      to: z.object({ x: z.number(), y: z.number() }),
      at: z.number(),
    })
    .nullable(),
  /** The profile menu (owner request), under the toolbar's avatar at `anchor`. */
  profileMenu: z.object({ anchor: rectSchema, openedAt: z.number() }).nullable(),
  /** The Orbit menu (UI spec §5), under the toolbar's "Orbit ⌄". */
  orbitMenu: z.object({ anchor: rectSchema, openedAt: z.number() }).nullable().default(null),
  /** A sidebar app floating over the page (unpinned): its frame; a click outside tucks it away. */
  appFloat: z.object({ rect: rectSchema }).nullable().default(null),
  /** Settings open over the window (its page sits on top): a dimmed backdrop that puts it away. */
  sheet: z.object({ rect: rectSchema }).nullable().default(null),
  /** The tucked-away app rail, slid out over the page while the pointer is on it. */
  railPeek: z.object({ rect: rectSchema }).nullable().default(null),
  /** An Arc-style tooltip for a shell control: label, key caps, and its box in the window.
   *  `alone`: nothing else is showing, so the overlay is just this box. */
  tooltip: z
    .object({
      label: z.string(),
      keys: z.array(z.string()),
      box: rectSchema,
      side: z.enum(['top', 'bottom', 'right']),
      alone: z.boolean(),
      at: z.number(),
    })
    .nullable(),
  /** A screenshot just taken (owner request): a preview and what to do with it. */
  shot: z
    .object({
      preview: z.string(),
      width: z.number(),
      height: z.number(),
      /** Under the toolbar, at the page's top-right corner (window coordinates). */
      anchor: rectSchema,
      at: z.number(),
    })
    .nullable()
    .default(null),
  /** Group Tabs (roadmap R2 M4): folders proposed for Today's loose tabs, to accept or edit. */
  grouping: z
    .object({
      spaceId: z.string(),
      at: z.number(),
      /** Today's loose tabs (the ones that would stay loose are the rest). */
      loose: z.number(),
      groups: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          reason: z.enum(['site', 'topic']),
          tabs: z.array(
            z.object({ id: z.string(), title: z.string(), favicon: z.string().nullable() }),
          ),
        }),
      ),
    })
    .nullable()
    .default(null),
  /** The voice popup (Siri-style): what you said and Orbit AI's answer, over the window. */
  voicePopup: z
    .object({
      at: z.number(),
      /** What was heard (null while listening). */
      heard: z.string().nullable(),
      answer: z
        .object({
          status: z.enum(['thinking', 'writing', 'done', 'stopped', 'error']),
          text: z.string(),
          actions: z.array(z.object({ label: z.string(), kind: z.string() })),
          error: z.string().nullable(),
        })
        .nullable(),
      /** Orbit AI answered (otherwise what you said was searched or opened). */
      ai: z.boolean(),
      /** Read the answer aloud (Settings → Voice), with which voice; quiet: tests. */
      speak: z.boolean(),
      voice: z.string().nullable(),
      quiet: z.boolean(),
    })
    .nullable()
    .default(null),
  /** The App Library (redesign brief §7): your apps and the catalogue, searchable. */
  appLibrary: z
    .object({
      at: z.number(),
      apps: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          host: z.string(),
          favicon: z.string().nullable(),
          openIn: z.enum(['tab', 'panel', 'window']),
          open: z.boolean(),
        }),
      ),
      catalog: z.array(
        z.object({
          group: z.string(),
          apps: z.array(
            z.object({ name: z.string(), url: z.string(), host: z.string(), added: z.boolean() }),
          ),
        }),
      ),
    })
    .nullable()
    .default(null),
  /** Orbit Capture (roadmap P2.1): the card that saves a finding to a project. */
  captureCard: z.object({ openedAt: z.number() }).nullable(),
  /** A quick note (F-33): a glass card over the page; it writes into note `id`. */
  quickNote: z.object({ id: z.string(), openedAt: z.number() }).nullable(),
  /** The sidebar's + popover (Img 2), above the button at `anchor`. */
  createMenu: z.object({ anchor: rectSchema, openedAt: z.number() }).nullable(),
  /** The hidden sidebar, slid out over the page while the pointer is on it (F-01). */
  sidebarPeek: z.object({ width: z.number() }).nullable(),
  siteControls: siteControlsViewSchema.nullable(),
  /** Area screenshot: the page's area in window coordinates, while the user drags. */
  capture: z.object({ area: rectSchema, openedAt: z.number() }).nullable(),
  /** Pick Color (roadmap P3.5): a still of the page over its area, with a loupe. */
  colorPick: z.object({ area: rectSchema, image: z.string(), openedAt: z.number() }).nullable(),
  /** The question currently being asked (others wait their turn). */
  prompt: promptSchema.nullable(),
  commandBar: z
    .object({
      mode: commandBarModeSchema,
      /** Pre-filled text (the current URL for ⌘L). */
      initialQuery: z.string(),
      /** Bumped on every open so the overlay resets even if the mode didn't change. */
      openedAt: z.number(),
    })
    .nullable(),
});
export type OverlayState = z.output<typeof overlayStateSchema>;
