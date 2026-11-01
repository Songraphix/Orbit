import { BrowserWindow, screen } from 'electron';
import type { WebContentsView } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';
import type { Broadcaster } from '../ipc/broadcaster';
import type { SenderRegistry } from '../ipc/sender';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { TabController } from '../tabs/tab-controller';
import type { HistorySink } from '../tabs/tab-controller';
import type { SidebarStore } from '../sidebar/store';
import type { Session } from 'electron';
import { FindController } from '../tabs/find';
import { SidebarActions } from '../sidebar/actions';
import { TabManager } from '../tabs/tab-manager';
import { LayoutEngine } from './layout-engine';
import { OverlayController } from './overlay';
import { MIN_SIZE, resolveWindowBounds } from './window-state';

/** Where the macOS traffic lights sit, inside the sidebar's top-left corner (F-01). */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 18 } as const;

/** Window position/size writes are debounced; moving a window fires dozens of events. */
const SAVE_DELAY_MS = 500;

export type WindowManagerDeps = {
  settings: SettingsRepository;
  store: SidebarStore;
  sessionFor: (profileId: string) => Session | undefined;
  history: HistorySink;
  zoomFor: (url: string) => number;
  senders: SenderRegistry;
  broadcaster: Broadcaster;
  preloadPath: string;
  internalPreloadPath: string;
  loadRenderer: (win: BrowserWindow, entry: RendererEntry) => void;
  /** Loads an internal orbit:// page (e.g. orbit://newtab) into a tab's view. */
  loadInternal: (view: WebContentsView, url: string) => void;
  /** Loads the overlay renderer into the overlay view. */
  loadOverlay: (view: WebContentsView) => void;
};

/** One Orbit window and the services scoped to it. */
export type WindowController = {
  win: BrowserWindow;
  layout: LayoutEngine;
  tabs: TabManager;
  overlay: OverlayController;
  find: FindController;
  store: SidebarStore;
  sidebar: SidebarActions;
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

  /** Opens the command bar: "new" (⌘T) starts empty, "edit" (⌘L) starts with the current URL. */
  openCommandBar(controller: WindowController, mode: 'new' | 'edit'): void {
    const active = controller.tabs.active?.state;
    const initial = mode === 'edit' && active?.kind === 'web' ? active.url : '';
    controller.overlay.openCommandBar(mode, initial);
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
    let lastActiveTabId: string | null = null;
    const find = new FindController(
      () => tabs?.active?.view.webContents ?? null,
      (state) => broadcaster.sendTo(contents, 'state:find', state),
    );
    const layout = new LayoutEngine(win, settings, (next) => {
      tabs?.applyLayout(); // web views move in the same tick the shell is told
      broadcaster.sendTo(contents, 'state:layout', next);
    });
    tabs = new TabManager({
      win,
      store: this.deps.store,
      initialSpaceId: settings.get('window.activeSpace') ?? '',
      sessionFor: this.deps.sessionFor,
      onSpaceChange: (spaceId) => settings.set('window.activeSpace', spaceId),
      getLayout: () => layout.current(),
      internalPreload: this.deps.internalPreloadPath,
      loadInternal: this.deps.loadInternal,
      registerInternal: (webContentsId) => senders.add(webContentsId, 'internal'),
      unregisterInternal: (webContentsId) => senders.remove(webContentsId),
      history: this.deps.history,
      zoomFor: this.deps.zoomFor,
      onFoundInPage: (result) => find.onResult(result),
      onChange: (snapshot, sidebar) => {
        broadcaster.sendTo(contents, 'state:tabs', snapshot);
        broadcaster.sendTo(contents, 'state:sidebar', sidebar);
        // Find belongs to the page it searched; switching tabs closes it.
        if (snapshot.activeTabId !== lastActiveTabId) {
          lastActiveTabId = snapshot.activeTabId;
          find.close();
        }
      },
      onHtmlFullscreen: (enter) => setHtmlFullscreen(enter),
    });
    const tabManager = tabs;

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

    // Floating UI (command bar…) above the pages. Its sender maps to this window too.
    const overlay = new OverlayController({
      win,
      preloadPath,
      load: this.deps.loadOverlay,
      register: (webContentsId) => senders.add(webContentsId, 'overlay'),
      unregister: (webContentsId) => senders.remove(webContentsId),
      send: (target, state) => broadcaster.sendTo(target, 'state:overlay', state),
      refocus: () => tabManager.active?.view.webContents.focus(),
    });

    const id = contents.id;
    const overlayId = overlay.view.webContents.id;
    const sidebar = new SidebarActions(this.deps.store, tabManager, {
      startRename: (target, renameId) =>
        broadcaster.sendTo(contents, 'rename:start', { target, id: renameId, at: Date.now() }),
      toast: (message) => broadcaster.sendTo(contents, 'toast:show', { message, at: Date.now() }),
      openCommandBar: () => overlay.openCommandBar('new'),
    });
    const controller: WindowController = {
      win,
      layout,
      tabs: tabManager,
      overlay,
      find,
      store: this.deps.store,
      sidebar,
    };
    this.controllers.set(id, controller);
    this.controllers.set(overlayId, controller);
    senders.add(id, 'shell');
    broadcaster.add(contents);
    contents.once('destroyed', () => {
      this.controllers.delete(id);
      this.controllers.delete(overlayId);
      senders.remove(id);
      broadcaster.remove(contents);
    });
    win.on('resize', () => {
      layout.update();
      if (overlay.isOpen) overlay.fit();
    });
    win.on('close', () => {
      layout.flush();
      this.deps.store.flushLive(); // the sidebar store saves structure at once; live details now
    });
    win.on('closed', () => {
      tabManager.destroyAll();
      overlay.destroy();
    });

    // Reopen the space and tab that were showing; a brand-new profile starts on a new tab page.
    const space = tabManager.space;
    const remembered = space.lastActiveItemId;
    if (remembered && this.deps.store.item(remembered)) tabManager.activate(remembered);
    else if (this.deps.store.tabsInOrder(space).length === 0) tabManager.create();

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
