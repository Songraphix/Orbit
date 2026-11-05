import type { Layout, LibraryPanel } from '@shared/types/layout';
import type { SettingsRepository } from '../persistence/repositories/settings';
import { clampDockWidth, computeLayout, sidebarDrag } from './layout';

/** The parts of BrowserWindow the engine uses (keeps it testable with a fake). */
export type LayoutWindow = {
  getContentSize(): number[];
  setWindowButtonVisibility(visible: boolean): void;
};

/** How long the dock (Notes, a docked app) takes to slide in or out (the panel duration). */
const DOCK_SLIDE_MS = 240;

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
  private notesWide = false;
  private dockWidth: number;
  private dockSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private topTabs: boolean;
  private apps: 'rail' | 'grid';
  private railAutoHide: boolean;
  /** A pinned app beside the rail (UI 3): shown, heading open or shut, its slide and width. */
  private appDock = false;
  /** Floating over the page (unpinned) rather than beside it. */
  private appFloat = false;
  private appTarget = false;
  private appProgress = 1;
  private appTimer: ReturnType<typeof setInterval> | null = null;
  private appWidth: number;
  private appSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private layout: Layout;

  constructor(
    private readonly win: LayoutWindow,
    private readonly settings: SettingsRepository,
    private readonly onChange: (layout: Layout) => void,
    /** Reduce Motion (macOS or Orbit's own setting): no slides. */
    private readonly reducedMotion?: () => boolean,
  ) {
    this.sidebarVisible = settings.get('sidebar.visible');
    this.sidebarWidth = settings.get('sidebar.width');
    this.topTabs = settings.get('tabs.layout') === 'top';
    this.apps = settings.get('ui').apps;
    this.railAutoHide = settings.get('ui').railAutoHide ?? false;
    this.appWidth = settings.get('appdock.width') ?? 360;
    this.dockWidth = settings.get('dock.width');
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

  /** The rail tucks away (auto-hide) or stays. */
  setRailAutoHide(on: boolean): void {
    if (on === this.railAutoHide) return;
    this.railAutoHide = on;
    this.update();
  }

  /** Pinned apps in the rail or as a grid in the sidebar (Settings → Appearance). */
  setApps(apps: 'rail' | 'grid'): void {
    if (apps === this.apps) return;
    this.apps = apps;
    this.update();
  }

  /** The traffic lights always have a place: the toolbar row, or the top of the sidebar. */
  private updateButtons(): void {
    this.win.setWindowButtonVisibility(true);
  }

  /** The Notes panel opened or closed. Not persisted. */
  setNotes(open: boolean, wide = this.notesWide): void {
    // Compare with where the dock is heading (it may be sliding the other way right now).
    if (open === this.notesTarget && wide === this.notesWide) return;
    const wasShown = this.notes;
    this.notesTarget = open;
    this.notesWide = wide;
    if (open) {
      this.notes = true;
      if (this.animate() && (!wasShown || this.slideTimer)) {
        // From closed, or reversing a slide out: on from where it is.
        if (!wasShown) this.dockProgress = 0;
        this.slide(1);
        return;
      }
      this.stopSlide();
      this.dockProgress = 1;
      this.update();
      return;
    }
    if (wasShown && this.animate()) {
      // The page grows back over the dock as it slides out, then the dock goes.
      this.slide(0, () => {
        this.notes = false;
        this.dockProgress = 1;
        this.update();
      });
      return;
    }
    this.stopSlide();
    this.notes = false;
    this.dockProgress = 1;
    this.update();
  }

  /** Where the dock is heading: open or closed. */
  private notesTarget = false;

  /** Whether the dock slides (not with Reduce Motion, or Orbit's Motion: Reduced). */
  private animate(): boolean {
    return !(this.reducedMotion?.() ?? false);
  }

  private dockProgress = 1;
  private slideTimer: ReturnType<typeof setInterval> | null = null;

  /** Eases the dock towards `to` over the panel duration (~60 steps a second). */
  private slide(to: number, done?: () => void): void {
    this.stopSlide();
    const from = this.dockProgress;
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / DOCK_SLIDE_MS);
      // ease-out cubic: quick to answer, soft to settle
      const eased = 1 - (1 - t) ** 3;
      this.dockProgress = from + (to - from) * eased;
      if (t >= 1) {
        this.stopSlide();
        this.dockProgress = to;
        if (done) done();
        else this.update();
        return;
      }
      this.update();
    };
    this.slideTimer = setInterval(step, 16);
    step();
  }

  private stopSlide(): void {
    if (this.slideTimer) clearInterval(this.slideTimer);
    this.slideTimer = null;
  }

  /** The dock's edge was dragged: its new width (saved once dragging settles). */
  setDockWidth(width: number): void {
    const clamped = clampDockWidth(width);
    if (clamped === this.dockWidth) return;
    this.dockWidth = clamped;
    if (this.dockSaveTimer) clearTimeout(this.dockSaveTimer);
    this.dockSaveTimer = setTimeout(() => this.flushDock(), SAVE_WIDTH_DELAY_MS);
    this.update();
  }

  /** Writes a pending dock width now (dragging ended, or the window is closing). */
  flushDock(): void {
    if (this.dockSaveTimer) clearTimeout(this.dockSaveTimer);
    this.dockSaveTimer = null;
    this.settings.set('dock.width', this.dockWidth);
    if (this.appSaveTimer) {
      clearTimeout(this.appSaveTimer);
      this.appSaveTimer = null;
      this.settings.set('appdock.width', this.appWidth);
    }
  }

  /** A pinned app opened beside the rail, or closed: it slides from the rail's side while the
   *  page makes room (and back), like the dock on the right. Not persisted. */
  setAppDock(open: boolean, float = false): void {
    if (open && float !== this.appFloat) {
      // Pinned ↔ floating while open: the page makes room (or takes it back) at once.
      this.appFloat = float;
      if (this.appTarget) {
        this.update();
        return;
      }
    }
    if (open === this.appTarget) return;
    const wasShown = this.appDock;
    this.appTarget = open;
    if (open) {
      this.appDock = true;
      if (this.animate() && (!wasShown || this.appTimer)) {
        if (!wasShown) this.appProgress = 0;
        this.slideApp(1);
        return;
      }
      this.stopApp();
      this.appProgress = 1;
      this.update();
      return;
    }
    if (wasShown && this.animate()) {
      this.slideApp(0, () => {
        this.appDock = false;
        this.appProgress = 1;
        this.update();
      });
      return;
    }
    this.stopApp();
    this.appDock = false;
    this.appProgress = 1;
    this.update();
  }

  /** The app panel's edge was dragged: its new width (saved once dragging settles). */
  setAppDockWidth(width: number): void {
    const clamped = clampDockWidth(width);
    if (clamped === this.appWidth) return;
    this.appWidth = clamped;
    if (this.appSaveTimer) clearTimeout(this.appSaveTimer);
    this.appSaveTimer = setTimeout(() => this.flushDock(), SAVE_WIDTH_DELAY_MS);
    this.update();
  }

  private slideApp(to: number, done?: () => void): void {
    this.stopApp();
    const from = this.appProgress;
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / DOCK_SLIDE_MS);
      this.appProgress = from + (to - from) * (1 - (1 - t) ** 3);
      if (t >= 1) {
        this.stopApp();
        this.appProgress = to;
        if (done) done();
        else this.update();
        return;
      }
      this.update();
    };
    this.appTimer = setInterval(step, 16);
    step();
  }

  private stopApp(): void {
    if (this.appTimer) clearInterval(this.appTimer);
    this.appTimer = null;
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
      notesWide: this.notesWide,
      dockWidth: this.dockWidth,
      dockProgress: this.dockProgress,
      topTabs: this.topTabs,
      apps: this.apps,
      railAutoHide: this.railAutoHide,
      appDock: this.appDock
        ? { width: this.appWidth, progress: this.appProgress, float: this.appFloat }
        : null,
    });
  }
}
