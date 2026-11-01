import { SIDEBAR_WIDTH } from '@shared/types/layout';
import type { Layout } from '@shared/types/layout';

/** Arc-like defaults (PLAN.md section 4.6). */
export const LAYOUT_DEFAULTS = {
  inset: 8,
  radius: 10,
  toolbarHeight: 36,
} as const;

export type LayoutInput = {
  windowWidth: number;
  windowHeight: number;
  sidebarVisible: boolean;
  sidebarWidth: number;
  /** A page is in HTML fullscreen (e.g. YouTube's fullscreen button): it gets the whole window. */
  htmlFullscreen?: boolean;
};

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
    return {
      sidebar: { visible: false, width: sidebarWidth },
      card: full,
      toolbar: { ...full, height: 0 },
      webView: full,
      radius: 0,
      fullscreen: true,
    };
  }

  const left = input.sidebarVisible ? sidebarWidth : inset;

  const card = {
    x: left,
    y: inset,
    width: Math.max(0, input.windowWidth - left - inset),
    height: Math.max(0, input.windowHeight - inset * 2),
  };
  const toolbar = { ...card, height: Math.min(toolbarHeight, card.height) };
  const webView = {
    x: card.x,
    y: card.y + toolbar.height,
    width: card.width,
    height: Math.max(0, card.height - toolbar.height),
  };

  return {
    sidebar: { visible: input.sidebarVisible, width: sidebarWidth },
    card,
    toolbar,
    webView,
    radius,
    fullscreen: false,
  };
}
