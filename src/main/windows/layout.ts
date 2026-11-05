import {
  ADDRESS_ROW_HEIGHT,
  LIBRARY_WIDTH,
  NOTES_WIDTH,
  PANE_HEADER_HEIGHT,
  RAIL_WIDTH,
  SIDEBAR_WIDTH,
  TAB_STRIP_HEIGHT,
} from '@shared/types/layout';
import type { Layout, LibraryPanel, Rect } from '@shared/types/layout';

/** Arc-like defaults (PLAN.md section 4.6). */
export const LAYOUT_DEFAULTS = {
  /** The gap between islands, and around the window's edge. */
  inset: 10,
  radius: 16,
  /** The toolbar row (and the tab row with tabs on top). */
  toolbarHeight: TAB_STRIP_HEIGHT,
} as const;

export type LayoutInput = {
  windowWidth: number;
  windowHeight: number;
  sidebarVisible: boolean;
  sidebarWidth: number;
  /** A page is in HTML fullscreen (e.g. YouTube's fullscreen button): it gets the whole window. */
  htmlFullscreen?: boolean;
  /** Split view (F-13): the left pane's share of the width (0.2–0.8), or null for one page. */
  splitRatio?: number | null;
  /** Library mode (F-11): its panel's size, or null. */
  library?: LibraryPanel | null;
  /** The Notes panel (F-33) is open on the right; wide for the Project Board. */
  notes?: boolean;
  notesWide?: boolean;
  /** The dock's width as last dragged (setting `dock.width`). */
  dockWidth?: number;
  /** How far the dock has slid in (0–1, eased) while it opens or closes; 1 when settled. The
   *  dock keeps its full width and slides in from the window's edge; the page makes room. */
  dockProgress?: number;
  /** Tabs on top instead of in the sidebar. */
  topTabs?: boolean;
  /** Pinned apps in a rail (UI 1, the default) or as a grid in the sidebar (UI 2). */
  apps?: 'rail' | 'grid';
  /** A pinned app open beside the rail: its width and how far it has slid in (0–1); `float`:
   *  over the page, which keeps its width. */
  appDock?: { width: number; progress: number; float?: boolean } | null;
};

/** How wide the dock is: the width you dragged it to (the Project Board at least its wide
 *  width), giving way (down to its minimum) so the page keeps at least `pageMin`. Pure. */
export function notesWidth(
  windowWidth: number,
  pageLeft: number,
  inset: number,
  wide = false,
  preferred: number = NOTES_WIDTH.panel,
): number {
  const { min, pageMin } = NOTES_WIDTH;
  const chosen = clampDockWidth(preferred);
  const spare = windowWidth - pageLeft - inset * 2 - pageMin;
  return Math.max(min, Math.min(wide ? Math.max(NOTES_WIDTH.wide, chosen) : chosen, spare));
}

/** A dragged dock width, kept within the dock's limits (whole pixels). Pure. */
export function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return NOTES_WIDTH.panel;
  return Math.round(Math.min(NOTES_WIDTH.max, Math.max(NOTES_WIDTH.min, width)));
}

/** Where Library mode's sections column and panel go, and where the page starts. Pure. */
export function libraryColumns(
  kind: LibraryPanel,
  windowWidth: number,
  windowHeight: number,
  inset: number,
): { nav: Rect; panel: Rect; pageLeft: number } {
  const { nav, panel, pageMin } = LIBRARY_WIDTH;
  // Wide (Spaces' columns) takes what the page can spare, keeping a strip of the page in view.
  const width = kind === 'wide' ? Math.max(panel, windowWidth - nav - inset - pageMin) : panel;
  return {
    nav: { x: 0, y: 0, width: nav, height: Math.max(0, windowHeight) },
    panel: { x: nav, y: inset, width, height: Math.max(0, windowHeight - inset * 2) },
    pageLeft: nav + width + inset,
  };
}

export function clampRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(0.8, Math.max(0.2, ratio)) : 0.5;
}

/** A page's card: in split view a slim header on top (its title, swap, close split). */
function paneIn(card: Rect, header: number) {
  const toolbar = { ...card, height: Math.min(header, card.height) };
  const webView = {
    x: card.x,
    y: card.y + toolbar.height,
    width: card.width,
    height: Math.max(0, card.height - toolbar.height),
  };
  return { card, toolbar, webView };
}

/** Dragging the sidebar's edge narrower than this hides it (Arc's push-to-collapse). */
export const SIDEBAR_COLLAPSE_AT = 110;

/** What an edge drag to `width` does: hide the sidebar, or resize it (clamped). Pure. */
export function sidebarDrag(
  width: number,
): { collapse: true } | { collapse: false; width: number } {
  if (Number.isFinite(width) && width < SIDEBAR_COLLAPSE_AT) return { collapse: true };
  return { collapse: false, width: clampSidebarWidth(width) };
}

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH.default;
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)));
}

/**
 * Pure layout maths (UI spec §5–8). Everything floats on the wallpaper canvas the shell paints:
 *
 * - **Rail + sidebar** (UI 1): a toolbar row across the top (traffic lights, Orbit menu,
 *   back / forward / reload, address, tools); below it the app rail, the sidebar island, then
 *   the page's card.
 * - **Sidebar grid** (UI 2): the sidebar island runs the full height (traffic lights inside);
 *   the toolbar row and the card sit to its right.
 * - **Tabs on top** (UI 3): the tab row across the top; the rail below it; the address row over
 *   the page, then its card.
 *
 * A pinned app may sit beside the rail (`appDock`) and the dock (Notes, the assistant) on the
 * right; the page narrows for both. Hiding the sidebar (⌘S) hides the rail too.
 */
export function computeLayout(input: LayoutInput): Layout {
  const { inset, radius, toolbarHeight } = LAYOUT_DEFAULTS;
  const sidebarWidth = clampSidebarWidth(input.sidebarWidth);
  const W = Math.max(0, input.windowWidth);
  const H = Math.max(0, input.windowHeight);

  if (input.htmlFullscreen) {
    // Section 4.6: the page fills the window edge to edge — no sidebar, toolbar or corners.
    const full = { x: 0, y: 0, width: W, height: H };
    const pane = { card: full, toolbar: { ...full, height: 0 }, webView: full };
    return {
      sidebar: { visible: false, width: sidebarWidth, rect: null },
      rail: null,
      toolbar: { ...full, height: 0 },
      card: full,
      webView: full,
      panes: [pane],
      divider: null,
      radius: 0,
      fullscreen: true,
      library: null,
      notes: null,
      appDock: null,
      appDockFloat: false,
      tabStrip: null,
    };
  }

  const library = input.library ? libraryColumns(input.library, W, H, inset) : null;
  // Tabs on top: the tab row replaces the sidebar (the Library still takes over the left).
  const strip = Boolean(input.topTabs) && !library;
  const shown = input.sidebarVisible && !library;
  const sidebarShown = shown && !strip;
  // The rail: always with tabs on top; beside the sidebar unless apps are a grid inside it.
  const railShown = shown && (strip || input.apps !== 'grid');
  const gridMode = sidebarShown && !railShown;
  const top = toolbarHeight;
  const below = { y: top, height: Math.max(0, H - top - inset) };

  let left: number = inset;
  const rail = railShown ? { x: inset, width: RAIL_WIDTH, ...below } : null;
  if (rail) left = rail.x + rail.width + inset;
  const sidebarRect = sidebarShown
    ? gridMode
      ? { x: inset, y: inset, width: sidebarWidth, height: Math.max(0, H - inset * 2) }
      : { x: left, width: sidebarWidth, ...below }
    : null;
  if (sidebarRect) left = sidebarRect.x + sidebarRect.width + inset;
  if (library) left = library.pageLeft;

  // A pinned app beside the rail: the page makes room as it slides in.
  const appProgress = Math.min(1, Math.max(0, input.appDock?.progress ?? 1));
  const appW = input.appDock
    ? Math.max(
        NOTES_WIDTH.min,
        Math.min(clampDockWidth(input.appDock.width), W - left - inset * 2 - NOTES_WIDTH.pageMin),
      )
    : 0;
  const appDock = input.appDock ? { x: left, width: appW, ...below } : null;
  const floatDock = Boolean(input.appDock?.float);
  if (appDock && !floatDock) left += (appW + inset) * appProgress;

  // Rows: the toolbar spans the window (it holds the traffic lights) unless the sidebar island
  // runs the full height (grid) or the Library's columns do; with tabs on top it's a second
  // row over the page.
  const tabStrip = strip ? { x: 0, y: 0, width: W, height: top } : null;
  const toolbar = strip
    ? { x: left, y: top, width: Math.max(0, W - left - inset), height: ADDRESS_ROW_HEIGHT }
    : gridMode || library
      ? { x: left - inset, y: 0, width: Math.max(0, W - left + inset), height: top }
      : { x: 0, y: 0, width: W, height: top };
  const cardTop = strip ? top + ADDRESS_ROW_HEIGHT : top;

  // The dock on the right, with the usual gap before it.
  const notesW = input.notes ? notesWidth(W, left, inset, input.notesWide, input.dockWidth) : 0;
  const progress = Math.min(1, Math.max(0, input.dockProgress ?? 1));
  const right = input.notes ? inset + (notesW + inset) * progress : inset;

  const card = {
    x: left,
    y: cardTop,
    width: Math.max(0, W - left - right),
    height: Math.max(0, H - cardTop - inset),
  };
  const notes = input.notes
    ? { x: card.x + card.width + inset, y: card.y, width: notesW, height: card.height }
    : null;
  // Split view: two cards side by side with a gap (the divider), each with a slim header.
  const panes =
    input.splitRatio == null
      ? [paneIn(card, 0)]
      : (() => {
          const usable = Math.max(0, card.width - inset);
          const leftWidth = Math.round(usable * clampRatio(input.splitRatio));
          return [
            paneIn({ ...card, width: leftWidth }, PANE_HEADER_HEIGHT),
            paneIn(
              { ...card, x: card.x + leftWidth + inset, width: usable - leftWidth },
              PANE_HEADER_HEIGHT,
            ),
          ];
        })();
  const divider =
    panes.length === 2
      ? { x: panes[0]!.card.x + panes[0]!.card.width, y: card.y, width: inset, height: card.height }
      : null;

  return {
    // In Library mode the sidebar is the sections column.
    sidebar: library
      ? { visible: true, width: library.nav.width, rect: library.nav }
      : { visible: sidebarShown, width: sidebarWidth, rect: sidebarRect },
    rail,
    toolbar,
    card: panes[0]!.card,
    webView: panes[0]!.webView,
    panes,
    divider,
    radius,
    fullscreen: false,
    library: library && { nav: library.nav, panel: library.panel },
    notes,
    appDock,
    appDockFloat: appDock !== null && floatDock,
    tabStrip,
  };
}

/** The Peek preview (F-23): a rounded frame floating over the content area. */
/** Peek's card (Arc-like): room on the right for its round buttons (close, expand, split). */
export const PEEK = { margin: 60, maxWidth: 1180, top: 22, headerHeight: 36, radius: 14 } as const;

/** The whole content area: the card, or both split panes together. Pure. */
export function contentArea(layout: Layout): Rect {
  const first = layout.panes[0]?.card ?? layout.card;
  const last = layout.panes.at(-1)?.card ?? layout.card;
  return { ...first, width: last.x + last.width - first.x };
}

/** Where the Peek frame, its header (drawn by the overlay) and its page go. Pure. */
export function computePeek(area: Rect): { frame: Rect; header: Rect; webView: Rect } {
  const width = Math.max(0, Math.min(PEEK.maxWidth, area.width - PEEK.margin * 2));
  const frame = {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + PEEK.top,
    width,
    height: Math.max(0, area.height - PEEK.top * 2),
  };
  const header = { ...frame, height: Math.min(PEEK.headerHeight, frame.height) };
  const webView = {
    x: frame.x,
    y: frame.y + header.height,
    width,
    height: Math.max(0, frame.height - header.height),
  };
  return { frame, header, webView };
}
