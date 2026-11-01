import { describe, expect, it } from 'vitest';
import {
  sidebarDrag,
  clampSidebarWidth,
  computeLayout,
  computePeek,
  contentArea,
} from '../../src/main/windows/layout';

const base = { windowWidth: 1280, windowHeight: 820, sidebarVisible: true, sidebarWidth: 260 };

describe('computeLayout', () => {
  it('places the card right of the sidebar, inset 8 px, with the toolbar on top', () => {
    const layout = computeLayout(base);
    expect(layout.sidebar).toEqual({ visible: true, width: 260 });
    expect(layout.card).toEqual({ x: 260, y: 8, width: 1012, height: 804 });
    expect(layout.toolbar).toEqual({ x: 260, y: 8, width: 1012, height: 36 });
    expect(layout.webView).toEqual({ x: 260, y: 44, width: 1012, height: 768 });
    expect(layout.radius).toBe(14);
  });

  it('gives the card the full width minus insets when the sidebar is hidden', () => {
    const layout = computeLayout({ ...base, sidebarVisible: false });
    expect(layout.card).toEqual({ x: 8, y: 8, width: 1264, height: 804 });
    expect(layout.webView.x).toBe(8);
  });

  it('keeps the toolbar and web view stacked exactly inside the card', () => {
    for (const windowHeight of [400, 820, 1440]) {
      const { card, toolbar, webView } = computeLayout({ ...base, windowHeight });
      expect(toolbar.y).toBe(card.y);
      expect(webView.y).toBe(toolbar.y + toolbar.height);
      expect(webView.y + webView.height).toBe(card.y + card.height);
    }
  });

  it('clamps the sidebar width into its allowed range', () => {
    expect(computeLayout({ ...base, sidebarWidth: 50 }).sidebar.width).toBe(150);
    expect(computeLayout({ ...base, sidebarWidth: 900 }).card.x).toBe(400);
  });

  it('never produces negative sizes in a tiny window', () => {
    const { card, toolbar, webView } = computeLayout({
      ...base,
      windowWidth: 100,
      windowHeight: 20,
    });
    for (const rect of [card, toolbar, webView]) {
      expect(rect.width).toBeGreaterThanOrEqual(0);
      expect(rect.height).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives an HTML-fullscreen page the whole window with no chrome', () => {
    const layout = computeLayout({
      ...base,
      windowWidth: 1920,
      windowHeight: 1080,
      htmlFullscreen: true,
    });
    expect(layout.webView).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(layout.toolbar.height).toBe(0);
    expect(layout.radius).toBe(0);
    expect(layout.sidebar.visible).toBe(false);
    expect(layout.fullscreen).toBe(true);
    // The remembered sidebar width survives fullscreen.
    expect(layout.sidebar.width).toBe(260);
  });
});

describe('split view layout', () => {
  it('splits the card into two panes with an 8 px divider', () => {
    const layout = computeLayout({ ...base, splitRatio: 0.5 });
    expect(layout.panes).toHaveLength(2);
    const [left, right] = layout.panes;
    // card 1012 wide: 1004 usable, 502 each, divider in between.
    expect(left!.card).toEqual({ x: 260, y: 8, width: 502, height: 804 });
    expect(layout.divider).toEqual({ x: 762, y: 8, width: 8, height: 804 });
    expect(right!.card).toEqual({ x: 770, y: 8, width: 502, height: 804 });
    expect(right!.webView.y).toBe(44);
    expect(layout.webView).toEqual(left!.webView); // first pane doubles as the main one
  });

  it('clamps the ratio and ignores it when not split', () => {
    const narrow = computeLayout({ ...base, splitRatio: 0.01 });
    expect(narrow.panes[0]!.card.width).toBe(Math.round(1004 * 0.2));
    expect(computeLayout({ ...base, splitRatio: null }).panes).toHaveLength(1);
    expect(computeLayout(base).divider).toBeNull();
  });
});

describe('Peek frame', () => {
  it('floats centred over the content area, header on top of the page', () => {
    const area = contentArea(computeLayout(base));
    expect(area).toEqual({ x: 260, y: 8, width: 1012, height: 804 });
    const peek = computePeek(area);
    expect(peek.frame).toEqual({ x: 308, y: 36, width: 916, height: 748 });
    expect(peek.webView).toEqual({ x: 308, y: 76, width: 916, height: 708 });
  });

  it('spans both split panes and caps its width on wide windows', () => {
    const area = contentArea(computeLayout({ ...base, windowWidth: 2560, splitRatio: 0.5 }));
    expect(area.width).toBe(2560 - 260 - 8);
    expect(computePeek(area).frame.width).toBe(1100);
  });
});

describe('clampSidebarWidth', () => {
  it('rounds and clamps, and falls back to the default for nonsense', () => {
    expect(clampSidebarWidth(250.6)).toBe(251);
    expect(clampSidebarWidth(149)).toBe(150);
    expect(clampSidebarWidth(401)).toBe(400);
    expect(clampSidebarWidth(Number.NaN)).toBe(260);
  });
});

describe('Library mode layout', () => {
  it('puts the sections column and a narrow panel before the page', () => {
    const layout = computeLayout({
      windowWidth: 1400,
      windowHeight: 900,
      sidebarVisible: false,
      sidebarWidth: 260,
      library: 'narrow',
    });
    expect(layout.sidebar).toEqual({ visible: true, width: 104 });
    expect(layout.library).toEqual({
      nav: { x: 0, y: 0, width: 104, height: 900 },
      panel: { x: 104, y: 8, width: 300, height: 884 },
    });
    expect(layout.card.x).toBe(412);
    expect(layout.card.width).toBe(1400 - 412 - 8);
  });

  it('a wide panel (Spaces) leaves a strip of the page in view', () => {
    const layout = computeLayout({
      windowWidth: 1400,
      windowHeight: 900,
      sidebarVisible: true,
      sidebarWidth: 260,
      library: 'wide',
    });
    expect(layout.library!.panel.width).toBe(1400 - 104 - 8 - 360);
    expect(layout.card.width).toBe(360 - 8);
    // A small window still gets the full narrow panel.
    const small = computeLayout({
      windowWidth: 700,
      windowHeight: 500,
      sidebarVisible: true,
      sidebarWidth: 260,
      library: 'wide',
    });
    expect(small.library!.panel.width).toBe(300);
  });
});

describe('Notes panel layout', () => {
  it('docks the panel on the right and narrows the page', () => {
    const layout = computeLayout({ ...base, notes: true });
    // 1280 − 260 sidebar − 8 gap − 380 panel − 8 edge = 624 for the page.
    expect(layout.card).toEqual({ x: 260, y: 8, width: 624, height: 804 });
    expect(layout.notes).toEqual({ x: 892, y: 8, width: 380, height: 804 });
    expect(computeLayout(base).notes).toBeNull();
  });

  it('gives way on small windows, but never below its minimum', () => {
    const mid = computeLayout({ ...base, windowWidth: 1000, notes: true });
    expect(mid.notes!.width).toBe(1000 - 260 - 16 - 420);
    expect(mid.card.width).toBe(420);
    const small = computeLayout({ ...base, windowWidth: 800, notes: true });
    expect(small.notes!.width).toBe(280);
    // The Project Board widens it, still leaving the page its minimum.
    const wide = computeLayout({ ...base, windowWidth: 1600, notes: true, notesWide: true });
    expect(wide.notes!.width).toBe(720);
    expect(computeLayout({ ...base, notes: true, notesWide: true }).card.width).toBe(420);
  });

  it('works beside split view and Library mode, and hides in fullscreen', () => {
    const split = computeLayout({ ...base, notes: true, splitRatio: 0.5 });
    expect(split.panes.at(-1)!.card.x + split.panes.at(-1)!.card.width).toBe(split.notes!.x - 8);
    const library = computeLayout({ ...base, windowWidth: 1400, notes: true, library: 'narrow' });
    expect(library.card.x).toBe(412);
    expect(library.notes!.x).toBe(library.card.x + library.card.width + 8);
    expect(computeLayout({ ...base, notes: true, htmlFullscreen: true }).notes).toBeNull();
  });
});

describe('tabs on top', () => {
  it('puts the strip across the top, hides the sidebar and starts the page below it', () => {
    const layout = computeLayout({ ...base, topTabs: true });
    expect(layout.tabStrip).toEqual({ x: 0, y: 0, width: 1280, height: 48 });
    expect(layout.sidebar.visible).toBe(false);
    expect(layout.card).toEqual({ x: 8, y: 48, width: 1264, height: 764 });
    expect(computeLayout(base).tabStrip).toBeNull();
  });

  it('keeps the Notes panel level with the page; Library and fullscreen take over', () => {
    const withNotes = computeLayout({ ...base, topTabs: true, notes: true });
    expect(withNotes.notes!.y).toBe(48);
    expect(withNotes.notes!.height).toBe(withNotes.card.height);
    expect(computeLayout({ ...base, topTabs: true, library: 'narrow' }).tabStrip).toBeNull();
    expect(computeLayout({ ...base, topTabs: true, htmlFullscreen: true }).tabStrip).toBeNull();
  });
});

describe('sidebar edge drag', () => {
  it('resizes within limits, and hides when pushed to the edge', () => {
    expect(sidebarDrag(300)).toEqual({ collapse: false, width: 300 });
    expect(sidebarDrag(130)).toEqual({ collapse: false, width: 150 }); // held at the minimum
    expect(sidebarDrag(109)).toEqual({ collapse: true });
    expect(sidebarDrag(Number.NaN)).toEqual({ collapse: false, width: 260 });
  });
});
