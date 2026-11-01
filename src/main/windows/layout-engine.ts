import type { Layout } from '@shared/types/layout';
import type { SettingsRepository } from '../persistence/repositories/settings';
import { clampSidebarWidth, computeLayout } from './layout';

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
  private layout: Layout;

  constructor(
    private readonly win: LayoutWindow,
    private readonly settings: SettingsRepository,
    private readonly onChange: (layout: Layout) => void,
  ) {
    this.sidebarVisible = settings.get('sidebar.visible');
    this.sidebarWidth = settings.get('sidebar.width');
    this.layout = this.compute();
    this.win.setWindowButtonVisibility(this.sidebarVisible);
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
    // Arc hides the traffic lights with the sidebar so they never float over the page.
    this.win.setWindowButtonVisibility(visible);
    this.update();
  }

  setSidebarWidth(width: number): void {
    const clamped = clampSidebarWidth(width);
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
    });
  }
}
