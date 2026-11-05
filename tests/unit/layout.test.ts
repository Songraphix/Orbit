import { describe, expect, it } from 'vitest';
import {
  sidebarDrag,
  clampDockWidth,
  clampSidebarWidth,
  computeLayout,
  computePeek,
  contentArea,
} from '../../src/main/windows/layout';

// Rail + sidebar (UI 1) unless a test says otherwise. Gaps are 10 px; the toolbar row is 52.
const base = { windowWidth: 1280, windowHeight: 820, sidebarVisible: true, sidebarWidth: 260 };

describe('computeLayout — rail and sidebar (UI 1)', () => {
  it('puts the toolbar across the top, then the rail, the sidebar island and the card', () => {
    const layout = computeLayout(base);
    expect(layout.toolbar).toEqual({ x: 0, y: 0, width: 1280, height: 52 });
    expect(layout.rail).toEqual({ x: 10, y: 52, width: 60, height: 758 });
    expect(layout.sidebar).toEqual({
      visible: true,
      width: 260,
      rect: { x: 80, y: 52, width: 260, height: 758 },
    });
    expect(layout.card).toEqual({ x: 350, y: 52, width: 920, height: 758 });
    expect(layout.webView).toEqual(layout.card); // no toolbar inside the card any more
    expect(layout.radius).toBe(16);
  });

  it('hiding the sidebar hides the rail too; the card takes the width', () => {
    const layout = computeLayout({ ...base, sidebarVisible: false });
    expect(layout.rail).toBeNull();
    expect(layout.sidebar.rect).toBeNull();
    expect(layout.card).toEqual({ x: 10, y: 52, width: 1260, height: 758 });
  });

  it('clamps the sidebar width into its allowed range', () => {
    expect(computeLayout({ ...base, sidebarWidth: 50 }).sidebar.width).toBe(150);
    expect(computeLayout({ ...base, sidebarWidth: 900 }).card.x).toBe(80 + 400 + 10);
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
    expect(layout.rail).toBeNull();
    expect(layout.fullscreen).toBe(true);
    // The remembered sidebar width survives fullscreen.
    expect(layout.sidebar.width).toBe(260);
  });
});

describe('computeLayout — sidebar grid (UI 2)', () => {
  it('runs the sidebar the full height (traffic lights inside); the toolbar sits to its right', () => {
    const layout = computeLayout({ ...base, apps: 'grid' });
    expect(layout.rail).toBeNull();
    expect(layout.sidebar.rect).toEqual({ x: 10, y: 10, width: 260, height: 800 });
    expect(layout.toolbar).toEqual({ x: 270, y: 0, width: 1010, height: 52 });
    expect(layout.card).toEqual({ x: 280, y: 52, width: 990, height: 758 });
  });

  it('hidden, the toolbar spans the window again', () => {
    const layout = computeLayout({ ...base, apps: 'grid', sidebarVisible: false });
    expect(layout.toolbar).toEqual({ x: 0, y: 0, width: 1280, height: 52 });
    expect(layout.card.x).toBe(10);
  });
});

describe('split view layout', () => {
  it('splits the card into two panes with a 10 px divider, each with a slim header', () => {
    const layout = computeLayout({ ...base, splitRatio: 0.5 });
    expect(layout.panes).toHaveLength(2);
    const [left, right] = layout.panes;
    // card 920 wide: 910 usable, 455 each, divider in between.
    expect(left!.card).toEqual({ x: 350, y: 52, width: 455, height: 758 });
    expect(layout.divider).toEqual({ x: 805, y: 52, width: 10, height: 758 });
    expect(right!.card).toEqual({ x: 815, y: 52, width: 455, height: 758 });
    expect(right!.toolbar.height).toBe(32);
    expect(right!.webView.y).toBe(84);
    expect(layout.webView).toEqual(left!.webView); // first pane doubles as the main one
  });

  it('clamps the ratio and ignores it when not split', () => {
    const narrow = computeLayout({ ...base, splitRatio: 0.01 });
    expect(narrow.panes[0]!.card.width).toBe(Math.round(910 * 0.2));
    expect(computeLayout({ ...base, splitRatio: null }).panes).toHaveLength(1);
    expect(computeLayout(base).divider).toBeNull();
  });
});

describe('Peek frame', () => {
  it('floats centred over the content area, header on top of the page', () => {
    const area = contentArea(computeLayout(base));
    expect(area).toEqual({ x: 350, y: 52, width: 920, height: 758 });
    const peek = computePeek(area);
    expect(peek.frame).toEqual({ x: 410, y: 74, width: 800, height: 714 });
    expect(peek.webView).toEqual({ x: 410, y: 110, width: 800, height: 678 });
  });

  it('spans both split panes and caps its width on wide windows', () => {
    const area = contentArea(computeLayout({ ...base, windowWidth: 2560, splitRatio: 0.5 }));
    expect(area.width).toBe(2560 - 350 - 10);
    expect(computePeek(area).frame.width).toBe(1180);
  });
});

describe('clampSidebarWidth', () => {
  it('rounds and clamps, and falls back to the default for nonsense', () => {
    expect(clampSidebarWidth(250.6)).toBe(251);
    expect(clampSidebarWidth(149)).toBe(150);
    expect(clampSidebarWidth(401)).toBe(400);
    expect(clampSidebarWidth(Number.NaN)).toBe(236);
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
    expect(layout.sidebar).toEqual({
      visible: true,
      width: 116,
      rect: { x: 0, y: 0, width: 116, height: 900 },
    });
    expect(layout.library).toEqual({
      nav: { x: 0, y: 0, width: 116, height: 900 },
      panel: { x: 116, y: 10, width: 300, height: 880 },
    });
    expect(layout.rail).toBeNull();
    expect(layout.card.x).toBe(426);
    expect(layout.card.width).toBe(1400 - 426 - 10);
    expect(layout.toolbar).toEqual({ x: 416, y: 0, width: 984, height: 52 });
  });

  it('a wide panel (Spaces) leaves a strip of the page in view', () => {
    const layout = computeLayout({
      windowWidth: 1400,
      windowHeight: 900,
      sidebarVisible: true,
      sidebarWidth: 260,
      library: 'wide',
    });
    expect(layout.library!.panel.width).toBe(1400 - 116 - 10 - 360);
    expect(layout.card.width).toBe(360 - 10);
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

describe('the dock (Notes, the assistant, a docked app)', () => {
  it('docks on the right below the toolbar and narrows the page', () => {
    const layout = computeLayout({ ...base, notes: true });
    // 1280 − 350 left − 10 gap − 380 panel − 10 edge = 530 for the page.
    expect(layout.card).toEqual({ x: 350, y: 52, width: 530, height: 758 });
    expect(layout.notes).toEqual({ x: 890, y: 52, width: 380, height: 758 });
    expect(computeLayout(base).notes).toBeNull();
  });

  it('gives way on small windows, but never below its minimum', () => {
    const mid = computeLayout({ ...base, windowWidth: 1150, notes: true });
    expect(mid.notes!.width).toBe(1150 - 350 - 20 - 420);
    expect(mid.card.width).toBe(420);
    const small = computeLayout({ ...base, windowWidth: 800, notes: true });
    expect(small.notes!.width).toBe(280);
    // The Project Board widens it, still leaving the page its minimum.
    const wide = computeLayout({ ...base, windowWidth: 1600, notes: true, notesWide: true });
    expect(wide.notes!.width).toBe(720);
    expect(computeLayout({ ...base, notes: true, notesWide: true }).card.width).toBe(420);
  });

  it('takes the width it was dragged to, within its limits and the page’s minimum', () => {
    const dragged = computeLayout({ ...base, windowWidth: 1600, notes: true, dockWidth: 520 });
    expect(dragged.notes!.width).toBe(520);
    expect(dragged.card.x + dragged.card.width).toBe(dragged.notes!.x - 10);
    // Wider than the window allows: the page keeps 420 px.
    const big = computeLayout({ ...base, notes: true, dockWidth: 1000 });
    expect(big.card.width).toBe(420);
    // The Project Board is at least its wide width, or wider if dragged so.
    const board = { ...base, windowWidth: 2200, notes: true, notesWide: true };
    expect(computeLayout({ ...board, dockWidth: 400 }).notes!.width).toBe(720);
    expect(computeLayout({ ...board, dockWidth: 900 }).notes!.width).toBe(900);
  });

  it('slides in: the dock keeps its width while the page makes room for it', () => {
    const half = computeLayout({ ...base, windowWidth: 1600, notes: true, dockProgress: 0.5 });
    const full = computeLayout({ ...base, windowWidth: 1600, notes: true });
    expect(half.notes!.width).toBe(full.notes!.width);
    expect(half.card.width).toBeGreaterThan(full.card.width);
    expect(half.notes!.x).toBe(half.card.x + half.card.width + 10);
    // Partly past the window's edge (the window clips it): it slides in from the right.
    expect(half.notes!.x + half.notes!.width).toBeGreaterThan(1600);
    const start = computeLayout({ ...base, windowWidth: 1600, notes: true, dockProgress: 0 });
    expect(start.card.width).toBe(computeLayout({ ...base, windowWidth: 1600 }).card.width);
  });

  it('clamps dragged dock widths to 280–1000 whole pixels', () => {
    expect(clampDockWidth(100)).toBe(280);
    expect(clampDockWidth(5000)).toBe(1000);
    expect(clampDockWidth(433.6)).toBe(434);
    expect(clampDockWidth(Number.NaN)).toBe(380);
  });

  it('works beside split view and Library mode, and hides in fullscreen', () => {
    const split = computeLayout({ ...base, notes: true, splitRatio: 0.5 });
    expect(split.panes.at(-1)!.card.x + split.panes.at(-1)!.card.width).toBe(split.notes!.x - 10);
    const library = computeLayout({ ...base, windowWidth: 1400, notes: true, library: 'narrow' });
    expect(library.card.x).toBe(426);
    expect(library.notes!.x).toBe(library.card.x + library.card.width + 10);
    expect(computeLayout({ ...base, notes: true, htmlFullscreen: true }).notes).toBeNull();
  });
});

describe('a pinned app beside the rail (UI 3)', () => {
  it('opens between the sidebar and the page; the page narrows as it slides in', () => {
    const open = computeLayout({ ...base, appDock: { width: 360, progress: 1 } });
    expect(open.appDock).toEqual({ x: 350, y: 52, width: 360, height: 758 });
    expect(open.card).toEqual({ x: 720, y: 52, width: 550, height: 758 });
    const half = computeLayout({ ...base, appDock: { width: 360, progress: 0.5 } });
    expect(half.card.x).toBe(350 + 185);
    expect(computeLayout(base).appDock).toBeNull();
  });

  it('keeps the page its minimum width, and sits beside the right-hand dock', () => {
    const both = computeLayout({
      ...base,
      windowWidth: 1600,
      appDock: { width: 900, progress: 1 },
      notes: true,
    });
    expect(both.appDock!.width).toBe(1600 - 350 - 20 - 420);
    expect(both.notes).not.toBeNull();
  });
});

describe('tabs on top (UI 3)', () => {
  it('puts the tab row across the top, the rail below it and the address row over the page', () => {
    const layout = computeLayout({ ...base, topTabs: true });
    expect(layout.tabStrip).toEqual({ x: 0, y: 0, width: 1280, height: 52 });
    expect(layout.sidebar.visible).toBe(false);
    expect(layout.rail).toEqual({ x: 10, y: 52, width: 60, height: 758 });
    expect(layout.toolbar).toEqual({ x: 80, y: 52, width: 1190, height: 46 });
    expect(layout.card).toEqual({ x: 80, y: 98, width: 1190, height: 712 });
    expect(computeLayout(base).tabStrip).toBeNull();
  });

  it('keeps the rail even when apps are a grid (there’s no sidebar to hold them)', () => {
    expect(computeLayout({ ...base, topTabs: true, apps: 'grid' }).rail).not.toBeNull();
    expect(computeLayout({ ...base, topTabs: true, sidebarVisible: false }).rail).toBeNull();
  });

  it('keeps the dock level with the page; Library and fullscreen take over', () => {
    const withNotes = computeLayout({ ...base, topTabs: true, notes: true });
    expect(withNotes.notes!.y).toBe(98);
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
    expect(sidebarDrag(Number.NaN)).toEqual({ collapse: false, width: 236 });
  });
});
