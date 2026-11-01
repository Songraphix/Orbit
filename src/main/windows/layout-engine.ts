import type { Layout, LibraryPanel } from '@shared/types/layout';
import type { SettingsRepository } from '../persistence/repositories/settings';
import { computeLayout, sidebarDrag } from './layout';

/** The parts of BrowserWindow the engine uses (keeps it testable with a fake). */
export type LayoutWindow = {
  getContentSize(): number[];
  setWindowButtonVisibility(visible: boolean): void;
};

/** Sidebar width is saved after dragging settles, not on every pixel. */
const SAVE_WIDTH_DELAY_MS = 300;

/**
 * Owns one window's layout state (sidebar visible/width) and recomputes the layout whenever
 * it or the window size changes. Main is the source of truth (ADR-004): renderers ask for
 * changes via IPC and receive the result through `onChange`.
 */
export class LayoutEngine {
  private sidebarVisible: boolean;
  private sidebarWidth: number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private fullscreen = false;
  private splitRatio: number | null = null;
  private library: LibraryPanel | null = null;
  private notes = false;
  private topTabs: boolean;
  private layout: Layout;

  constructor(
    private readonly win: LayoutWindow,
    private readonly settings: SettingsRepository,
    private readonly onChange: (layout: Layout) => void,
  ) {
    this.sidebarVisible = settings.get('sidebar.visible');
    this.sidebarWidth = settings.get('sidebar.width');
    this.topTabs = settings.get('tabs.layout') === 'top';
    this.layout = this.compute();
    this.updateButtons();
  }

  current(): Layout {
    return this.layout;
  }

  toggleSidebar(): void {
    this.setSidebarVisible(!this.sidebarVisible);
  }

  setSidebarVisible(visible: boolean): void {
    if (visible === this.sidebarVisible) return;
    this.sidebarVisible = visible;
    this.settings.set('sidebar.visible', visible);
    this.updateButtons();
    this.update();
  }

  setSidebarWidth(width: number): void {
    const drag = sidebarDrag(width);
    if (drag.collapse) {
      // Pushed right up to the window's edge: the sidebar hides (its width is kept for later).
      this.setSidebarVisible(false);
      return;
    }
    const clamped = drag.width;
    if (clamped === this.sidebarWidth) return;
    this.sidebarWidth = clamped;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_WIDTH_DELAY_MS);
    this.update();
  }

  get htmlFullscreen(): boolean {
    return this.fullscreen;
  }

  /** A page entered/left HTML fullscreen (not persisted). */
  setHtmlFullscreen(on: boolean): void {
    if (on === this.fullscreen) return;
    this.fullscreen = on;
    this.update();
  }

  /** Library mode opened (its panel's size) or closed (null). Not persisted. */
  setLibrary(panel: LibraryPanel | null): void {
    if (panel === this.library) return;
    this.library = panel;
    this.updateButtons();
    this.update();
  }

  /** Tabs on top (the tab strip) or in the sidebar. Saved by Settings. */
  setTopTabs(on: boolean): void {
    if (on === this.topTabs) return;
    this.topTabs = on;
    this.updateButtons();
    this.update();
  }

  /** Arc hides the traffic lights with the sidebar so they never float over the page; the
   *  Library's column and the tab strip have room for them. */
  private updateButtons(): void {
    this.win.setWindowButtonVisibility(
      this.sidebarVisible || this.library !== null || this.topTabs,
    );
  }

  /** The Notes panel opened or closed. Not persisted. */
  setNotes(open: boolean): void {
    if (open === this.notes) return;
    this.notes = open;
    this.update();
  }

  /** Split view started/resized (ratio) or ended (null). Not persisted. */
  setSplitRatio(ratio: number | null): void {
    if (ratio === this.splitRatio) return;
    this.splitRatio = ratio;
    this.update();
  }

  /** Call when the window's size changes. */
  update(): void {
    this.layout = this.compute();
    this.onChange(this.layout);
  }

  /** Writes any pending sidebar width immediately (e.g. on window close). */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.settings.set('sidebar.width', this.sidebarWidth);
  }

  private compute(): Layout {
    const [windowWidth = 0, windowHeight = 0] = this.win.getContentSize();
    return computeLayout({
      windowWidth,
      windowHeight,
      sidebarVisible: this.sidebarVisible,
      sidebarWidth: this.sidebarWidth,
      htmlFullscreen: this.fullscreen,
      splitRatio: this.splitRatio,
      library: this.library,
      notes: this.notes,
      topTabs: this.topTabs,
    });
  }
}
