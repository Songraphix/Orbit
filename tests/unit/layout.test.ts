import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, computeLayout } from '../../src/main/windows/layout';

const base = { windowWidth: 1280, windowHeight: 820, sidebarVisible: true, sidebarWidth: 260 };

describe('computeLayout', () => {
  it('places the card right of the sidebar, inset 8 px, with the toolbar on top', () => {
    const layout = computeLayout(base);
    expect(layout.sidebar).toEqual({ visible: true, width: 260 });
    expect(layout.card).toEqual({ x: 260, y: 8, width: 1012, height: 804 });
    expect(layout.toolbar).toEqual({ x: 260, y: 8, width: 1012, height: 36 });
    expect(layout.webView).toEqual({ x: 260, y: 44, width: 1012, height: 768 });
    expect(layout.radius).toBe(10);
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
    expect(computeLayout({ ...base, sidebarWidth: 50 }).sidebar.width).toBe(200);
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

describe('clampSidebarWidth', () => {
  it('rounds and clamps, and falls back to the default for nonsense', () => {
    expect(clampSidebarWidth(250.6)).toBe(251);
    expect(clampSidebarWidth(199)).toBe(200);
    expect(clampSidebarWidth(401)).toBe(400);
    expect(clampSidebarWidth(Number.NaN)).toBe(260);
  });
});
