import { z } from 'zod';
import { rectSchema } from './layout';
import { siteControlsViewSchema } from './site-controls';

/** One row in the command bar (F-21). Main builds and ranks these; the overlay just draws them. */
export const commandItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['navigate', 'search', 'tab', 'history', 'suggestion', 'command']),
  title: z.string(),
  subtitle: z.string(),
  favicon: z.string().nullable(),
  /** navigate / search / history / suggestion */
  url: z.string().optional(),
  /** tab */
  tabId: z.string().optional(),
  /** command */
  commandId: z.string().optional(),
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
  frame: rectSchema,
  headerHeight: z.number(),
  radius: z.number(),
});
export type PeekView = z.output<typeof peekViewSchema>;

export const overlayStateSchema = z.object({
  peek: peekViewSchema.nullable(),
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
  /** A quick note (F-33): a glass card over the page; it writes into note `id`. */
  quickNote: z.object({ id: z.string(), openedAt: z.number() }).nullable(),
  /** The sidebar's + popover (Img 2), above the button at `anchor`. */
  createMenu: z.object({ anchor: rectSchema, openedAt: z.number() }).nullable(),
  /** The hidden sidebar, slid out over the page while the pointer is on it (F-01). */
  sidebarPeek: z.object({ width: z.number() }).nullable(),
  siteControls: siteControlsViewSchema.nullable(),
  /** Area screenshot: the page's area in window coordinates, while the user drags. */
  capture: z.object({ area: rectSchema, openedAt: z.number() }).nullable(),
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
