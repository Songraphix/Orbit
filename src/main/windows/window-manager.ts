import { BrowserWindow, screen } from 'electron';
import type { WebContentsView } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';
import type { Broadcaster } from '../ipc/broadcaster';
import type { SenderRegistry } from '../ipc/sender';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { TabsRepository } from '../persistence/repositories/tabs';
import type { TabController } from '../tabs/tab-controller';
import { TabManager } from '../tabs/tab-manager';
import { LayoutEngine } from './layout-engine';
import { MIN_SIZE, resolveWindowBounds } from './window-state';

/** Where the macOS traffic lights sit, inside the sidebar's top-left corner (F-01). */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 18 } as const;

/** Window position/size writes are debounced; moving a window fires dozens of events. */
const SAVE_DELAY_MS = 500;
/** Tab list writes are debounced too (titles and favicons change in bursts). */
const TAB_SAVE_DELAY_MS = 500;

export type WindowManagerDeps = {
  settings: SettingsRepository;
  tabsRepo: TabsRepository;
  senders: SenderRegistry;
  broadcaster: Broadcaster;
  preloadPath: string;
  internalPreloadPath: string;
  loadRenderer: (win: BrowserWindow, entry: RendererEntry) => void;
  /** Loads an internal orbit:// page (e.g. orbit://newtab) into a tab's view. */
  loadInternal: (view: WebContentsView, url: string) => void;
};

/** One Orbit window and the services scoped to it. */
export type WindowController = {
  win: BrowserWindow;
  layout: LayoutEngine;
  tabs: TabManager;
};

/** Creates and restores Orbit's windows (PLAN.md section 4.3). */
export class WindowManager {
  /** Keyed by the shell's webContents id, so IPC handlers can find the sender's window. */
  private readonly controllers = new Map<number, WindowController>();

  constructor(private readonly deps: WindowManagerDeps) {}

  /** The window whose shell sent an IPC message. */
  forSender(webContentsId: number): WindowController | undefined {
    return this.controllers.get(webContentsId);
  }

  /** The tab (and its window) whose page is this webContents, e.g. a new tab page calling IPC. */
  tabForContents(webContentsId: number): { window: WindowController; tab: TabController } | null {
    for (const window of this.controllers.values()) {
      const tab = window.tabs.findByContents(webContentsId);
      if (tab) return { window, tab };
    }
    return null;
  }

  /** The focused window (for menu commands), falling back to any window. */
  focused(): WindowController | undefined {
    const win = BrowserWindow.getFocusedWindow();
    const match = [...this.controllers.values()].find((c) => c.win === win);
    return match ?? this.controllers.values().next().value;
  }

  createMainWindow(): BrowserWindow {
    const { settings, senders, broadcaster, preloadPath, loadRenderer } = this.deps;
    const saved = settings.get('window.state');
    const workAreas = [
      screen.getPrimaryDisplay().workArea,
      ...screen
        .getAllDisplays()
        .filter((d) => d.id !== screen.getPrimaryDisplay().id)
        .map((d) => d.workArea),
    ];
    const bounds = resolveWindowBounds(saved.bounds, workAreas);

    const win = new BrowserWindow({
      title: APP_NAME,
      ...bounds,
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      show: false,
      // Arc look: no visible title bar, traffic lights inside the sidebar, translucent sidebar.
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: TRAFFIC_LIGHT_POSITION,
      vibrancy: 'sidebar',
      visualEffectState: 'followWindow',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    if (saved.isMaximized) win.maximize();

    const contents = win.webContents;
    let tabs: TabManager | null = null;
    const layout = new LayoutEngine(win, settings, (next) => {
      tabs?.applyLayout(); // web views move in the same tick the shell is told
      broadcaster.sendTo(contents, 'state:layout', next);
    });
    tabs = new TabManager({
      win,
      getLayout: () => layout.current(),
      internalPreload: this.deps.internalPreloadPath,
      loadInternal: this.deps.loadInternal,
      registerInternal: (webContentsId) => senders.add(webContentsId, 'internal'),
      unregisterInternal: (webContentsId) => senders.remove(webContentsId),
      onChange: (snapshot) => {
        broadcaster.sendTo(contents, 'state:tabs', snapshot);
        scheduleTabSave();
      },
      onHtmlFullscreen: (enter) => setHtmlFullscreen(enter),
    });
    const tabManager = tabs;

    // Session restore (PLAN.md section 5.3): open tabs are saved shortly after every change
    // and immediately on close, so a force-quit loses at most the last half second.
    let tabSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const saveTabs = () => {
      if (tabSaveTimer) clearTimeout(tabSaveTimer);
      tabSaveTimer = null;
      this.deps.tabsRepo.saveAll(tabManager.toSaved());
    };
    function scheduleTabSave() {
      if (tabSaveTimer) clearTimeout(tabSaveTimer);
      tabSaveTimer = setTimeout(saveTabs, TAB_SAVE_DELAY_MS);
    }

    // HTML fullscreen (section 4.6): Electron doesn't do this for us. The page takes the whole
    // window, and the window goes fullscreen unless it already was (then we leave it as is).
    let enteredWindowFullscreen = false;
    // macOS ignores setFullScreen(false) while the enter animation is still running, so an exit
    // requested mid-animation (Esc right after clicking fullscreen) is applied once it finishes.
    let entering = false;
    let exitAfterEnter = false;
    const setHtmlFullscreen = (enter: boolean) => {
      if (enter === layout.htmlFullscreen) return;
      layout.setHtmlFullscreen(enter);
      if (enter && !win.isFullScreen()) {
        enteredWindowFullscreen = true;
        entering = true;
        exitAfterEnter = false;
        win.setFullScreen(true);
      } else if (!enter && enteredWindowFullscreen) {
        enteredWindowFullscreen = false;
        if (entering) exitAfterEnter = true;
        else win.setFullScreen(false);
      }
    };
    win.on('enter-full-screen', () => {
      entering = false;
      if (exitAfterEnter) {
        exitAfterEnter = false;
        win.setFullScreen(false);
      }
    });
    // Leaving window fullscreen (green button, ⌃⌘F) also ends the page's fullscreen.
    win.on('leave-full-screen', () => {
      if (!layout.htmlFullscreen) return;
      enteredWindowFullscreen = false;
      layout.setHtmlFullscreen(false);
      void tabManager.active?.view.webContents
        .executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true)
        .catch(() => undefined);
    });

    const id = contents.id;
    this.controllers.set(id, { win, layout, tabs: tabManager });
    senders.add(id, 'shell');
    broadcaster.add(contents);
    contents.once('destroyed', () => {
      this.controllers.delete(id);
      senders.remove(id);
      broadcaster.remove(contents);
    });
    win.on('resize', () => layout.update());
    win.on('close', () => {
      layout.flush();
      saveTabs();
    });
    win.on('closed', () => tabManager.destroyAll());

    // Reopen last session's tabs, or start with a new tab page.
    const savedTabs = this.deps.tabsRepo.load();
    if (savedTabs.length > 0) tabManager.restore(savedTabs);
    else tabManager.create();

    // The shell never navigates or opens windows itself (PLAN.md section 4.8).
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.persistWindowState(win);
    win.once('ready-to-show', () => win.show());
    loadRenderer(win, 'shell');
    return win;
  }

  private persistWindowState(win: BrowserWindow): void {
    const { settings } = this.deps;
    let timer: NodeJS.Timeout | null = null;

    const save = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
      // getNormalBounds = the un-maximised size, so un-maximising after relaunch works.
      const b = win.getNormalBounds();
      settings.set('window.state', {
        bounds: {
          x: Math.round(b.x),
          y: Math.round(b.y),
          width: Math.round(b.width),
          height: Math.round(b.height),
        },
        isMaximized: win.isMaximized(),
      });
    };
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    };

    win.on('resize', scheduleSave);
    win.on('move', scheduleSave);
    win.on('maximize', scheduleSave);
    win.on('unmaximize', scheduleSave);
    win.on('close', save); // flush immediately; the debounce may still be pending
  }
}
