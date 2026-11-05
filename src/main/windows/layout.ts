import { LIBRARY_WIDTH, NOTES_WIDTH, SIDEBAR_WIDTH, TAB_STRIP_HEIGHT } from '@shared/types/layout';
import type { Layout, LibraryPanel, Rect } from '@shared/types/layout';

/** Arc-like defaults (PLAN.md section 4.6). */
export const LAYOUT_DEFAULTS = {
  inset: 8,
  radius: 14,
  toolbarHeight: 36,
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
  /** Tabs on top instead of in the sidebar. */
  topTabs?: boolean;
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

/** A card (toolbar + web view) occupying `card`. */
function paneIn(card: Rect, toolbarHeight: number) {
  const toolbar = { ...card, height: Math.min(toolbarHeight, card.height) };
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
 * Pure layout maths. The sidebar runs full height on the left; the content card fills the
 * rest, inset from the window edges, with the toolbar strip on top and the web view below.
 * With the sidebar hidden, the card keeps its inset on the left too (that strip is where
 * hover-to-reveal will live).
 */
export function computeLayout(input: LayoutInput): Layout {
  const { inset, radius, toolbarHeight } = LAYOUT_DEFAULTS;
  const sidebarWidth = clampSidebarWidth(input.sidebarWidth);

  if (input.htmlFullscreen) {
    // Section 4.6: the page fills the window edge to edge — no sidebar, toolbar or corners.
    const full = {
      x: 0,
      y: 0,
      width: Math.max(0, input.windowWidth),
      height: Math.max(0, input.windowHeight),
    };
    const pane = { card: full, toolbar: { ...full, height: 0 }, webView: full };
    return {
      sidebar: { visible: false, width: sidebarWidth },
      ...pane,
      panes: [pane],
      divider: null,
      radius: 0,
      fullscreen: true,
      library: null,
      notes: null,
      tabStrip: null,
    };
  }

  const library = input.library
    ? libraryColumns(input.library, input.windowWidth, input.windowHeight, inset)
    : null;
  // Tabs on top: the strip across the window replaces the sidebar (the Library still takes over
  // the left when it's open).
  const strip = input.topTabs && !library;
  const sidebarVisible = input.sidebarVisible && !strip;
  const top = strip ? TAB_STRIP_HEIGHT : inset;
  const left = library ? library.pageLeft : sidebarVisible ? sidebarWidth : inset;
  // The Notes panel takes a column on the right, with the usual gap before it.
  const notesW = input.notes
    ? notesWidth(input.windowWidth, left, inset, input.notesWide, input.dockWidth)
    : 0;
  const right = input.notes ? notesW + inset * 2 : inset;

  const card = {
    x: left,
    y: top,
    width: Math.max(0, input.windowWidth - left - right),
    height: Math.max(0, input.windowHeight - top - inset),
  };
  const notes = input.notes
    ? { x: card.x + card.width + inset, y: card.y, width: notesW, height: card.height }
    : null;
  // Split view: two cards side by side with a gap (the divider) between them.
  const panes =
    input.splitRatio == null
      ? [paneIn(card, toolbarHeight)]
      : (() => {
          const usable = Math.max(0, card.width - inset);
          const leftWidth = Math.round(usable * clampRatio(input.splitRatio));
          return [
            paneIn({ ...card, width: leftWidth }, toolbarHeight),
            paneIn(
              { ...card, x: card.x + leftWidth + inset, width: usable - leftWidth },
              toolbarHeight,
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
      ? { visible: true, width: library.nav.width }
      : { visible: sidebarVisible, width: sidebarWidth },
    ...panes[0]!,
    panes,
    divider,
    radius,
    fullscreen: false,
    library: library && { nav: library.nav, panel: library.panel },
    notes,
    tabStrip: strip
      ? { x: 0, y: 0, width: Math.max(0, input.windowWidth), height: TAB_STRIP_HEIGHT }
      : null,
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
