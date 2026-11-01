import { BrowserWindow, dialog, screen } from 'electron';
import type { WebContents, WebContentsView } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';
import type { Broadcaster } from '../ipc/broadcaster';
import type { EventPayload } from '@shared/ipc/contract';
import type { SenderRegistry } from '../ipc/sender';
import type { ArchiveRepository } from '../persistence/repositories/archive';
import type { SettingsRepository } from '../persistence/repositories/settings';
import type { TabController } from '../tabs/tab-controller';
import type { HistorySink } from '../tabs/tab-controller';
import type { SidebarStore } from '../sidebar/store';
import type { Session } from 'electron';
import { FindController } from '../tabs/find';
import { SidebarActions } from '../sidebar/actions';
import { TabManager } from '../tabs/tab-manager';
import type { TabManagerDeps } from '../tabs/tab-manager';
import { MediaController } from '../media/controller';
import { PeekController } from '../peek/controller';
import { LibraryController } from '../library/controller';
import { NotesPanelController } from '../notes/panel';
import { notesHash } from '../notes/model';
import type { PageCaptureRequest } from '../tabs/context-menu';
import { shouldPeek } from '../peek/policy';
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
  archive: ArchiveRepository;
  sessionFor: (profileId: string) => Session | undefined;
  history: HistorySink;
  zoomFor: (url: string) => number;
  /** Chrome extensions (Phase 7). */
  extensions?: TabManagerDeps['extensions'];
  /** A site's own setting (e.g. 'peek' → 'off'), by page URL. */
  siteSetting: (url: string, key: string) => string | null;
  senders: SenderRegistry;
  broadcaster: Broadcaster;
  preloadPath: string;
  internalPreloadPath: string;
  loadRenderer: (win: BrowserWindow, entry: RendererEntry, query?: string) => void;
  /** Loads an internal orbit:// page (e.g. orbit://newtab) into a tab's view. */
  loadInternal: (target: { webContents: WebContents }, url: string) => void;
  /** Loads the overlay renderer into the overlay view. */
  loadOverlay: (view: WebContentsView) => void;
  /** Runs an app command for a window (the sidebar's + menu). */
  runCommand?: (controller: WindowController, id: string) => void;
  /** Orbit Capture from a page's right-click menu (roadmap P2.1). */
  capture?: (controller: WindowController, tabId: string, request: PageCaptureRequest) => void;
  /** Tidy's state per space (F-29), shown in the space header. */
  tidyState?: TabManagerDeps['tidyState'];
  /** Live Folders (F-28), for the space and folder menus. */
  liveFolders?: {
    add: (controller: WindowController, kind: 'rss' | 'pulls' | 'issues', spaceId: string) => void;
    refresh: (folderId: string | null) => void;
    markAllRead: (folderId: string) => void;
  };
};

/** One Orbit window and the services scoped to it. */
export type WindowController = {
  win: BrowserWindow;
  layout: LayoutEngine;
  tabs: TabManager;
  overlay: OverlayController;
  find: FindController;
  media: MediaController;
  peek: PeekController;
  library: LibraryController;
  /** The Notes panel on the right (F-33). */
  notes: NotesPanelController;
  /** Slides the hidden sidebar out over the page, or back in. */
  setSidebarPeek: (open: boolean) => void;
  store: SidebarStore;
  sidebar: SidebarActions;
};

/** Creates and restores Orbit's windows (PLAN.md section 4.3). */
export class WindowManager {
  /** Keyed by the shell's webContents id, so IPC handlers can find the sender's window. */
  private readonly controllers = new Map<number, WindowController>();

  constructor(private readonly deps: WindowManagerDeps) {}

  /** Every open window (each controller once). */
  all(): WindowController[] {
    return [...new Set(this.controllers.values())];
  }

  /** The window whose shell sent an IPC message. */
  forSender(webContentsId: number): WindowController | undefined {
    return this.controllers.get(webContentsId);
  }

  /** The window whose Notes panel is this webContents. */
  notesPanelFor(webContentsId: number): WindowController | null {
    return this.all().find((c) => c.notes.owns(webContentsId)) ?? null;
  }

  /** The window whose Library page is this webContents. */
  libraryFor(webContentsId: number): WindowController | null {
    return this.all().find((c) => c.library.owns(webContentsId)) ?? null;
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
    controller.peek.close(); // the bar would sit under the Peek page
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
    let peek: PeekController | null = null;
    let library: LibraryController | null = null;
    let notes: NotesPanelController | null = null;
    let overlayRef: OverlayController | null = null;
    /** The shell's sidebar state also goes to the overlay, which draws the slid-out sidebar. */
    const toOverlay = <E extends 'state:sidebar' | 'state:tabs' | 'state:media' | 'state:library'>(
      event: E,
      payload: EventPayload<E>,
    ) => {
      if (overlayRef) broadcaster.sendTo(overlayRef.view.webContents, event, payload);
    };
    let lastActiveTabId: string | null = null;
    const find = new FindController(
      () => tabs?.active?.view.webContents ?? null,
      (state) => broadcaster.sendTo(contents, 'state:find', state),
    );
    const layout = new LayoutEngine(win, settings, (next) => {
      tabs?.applyLayout(); // web views move in the same tick the shell is told
      peek?.fit();
      library?.fit();
      notes?.fit();
      // Pinning the sidebar (or a page going fullscreen) ends the slide-out.
      if (next.sidebar.visible || next.fullscreen) closeSidebarPeek();
      broadcaster.sendTo(contents, 'state:layout', next);
    });
    tabs = new TabManager({
      win,
      store: this.deps.store,
      archive: this.deps.archive,
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
      onMedia: (tabId, event) => media?.onMedia(tabId, event),
      // A frozen page: offer to wait or reload (F-31).
      onCapture: (tabId, request) => this.deps.capture?.(controller, tabId, request),
      onUnresponsive: (tabId) => {
        void dialog
          .showMessageBox(win, {
            type: 'warning',
            message: 'This page isn’t responding',
            detail: 'You can wait for it, or reload it.',
            buttons: ['Wait', 'Reload'],
            defaultId: 0,
            cancelId: 0,
          })
          .then(({ response }) => {
            const tab = tabs?.get(tabId);
            if (response !== 1 || !tab) return;
            tab.view.webContents.forcefullyCrashRenderer();
            tab.reload();
          });
      },
      onChange: (snapshot, sidebar) => {
        broadcaster.sendTo(contents, 'state:tabs', snapshot);
        toOverlay('state:tabs', snapshot);
        broadcaster.sendTo(contents, 'state:sidebar', sidebar);
        toOverlay('state:sidebar', sidebar);
        // Find belongs to the page it searched; switching tabs closes it.
        if (snapshot.activeTabId !== lastActiveTabId) {
          lastActiveTabId = snapshot.activeTabId;
          find.close();
        }
        media?.refresh(); // the mini player shows only while its tab is off screen
      },
      onHtmlFullscreen: (enter) => setHtmlFullscreen(enter),
      onSplitChange: (ratio) => layout.setSplitRatio(ratio),
      tidyState: this.deps.tidyState,
      siteSetting: this.deps.siteSetting,
      extensions: this.deps.extensions,
      peek: (fromTabId, url, activate) => {
        const fromUrl = tabs?.get(fromTabId)?.state.url ?? null;
        const open = shouldPeek({
          section: this.deps.store.item(fromTabId)?.section ?? null,
          fromUrl,
          toUrl: url,
          activate,
          enabled: settings.get('peek.enabled'),
          scope: settings.get('peek.scope'),
          siteSetting: fromUrl ? this.deps.siteSetting(fromUrl, 'peek') : null,
          devMode: fromUrl ? this.deps.siteSetting(fromUrl, 'devMode') === 'on' : false,
        });
        if (open) peek?.open(fromTabId, url);
        return open && peek !== null;
      },
    });
    const tabManager = tabs;
    const media = new MediaController(tabManager, (state) => {
      broadcaster.sendTo(contents, 'state:media', state);
      toOverlay('state:media', state);
    });

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
      // A third-size JPEG is plenty: it's blurred by 28 px anyway, and it's quick to capture.
      snapshot: async () => {
        const view = tabManager.active?.view;
        if (!view || view.webContents.isDestroyed() || !view.getVisible()) return null;
        const image = await view.webContents.capturePage();
        if (image.isEmpty()) return null;
        const small = image.resize({ width: Math.max(1, Math.round(image.getSize().width / 3)) });
        return {
          image: `data:image/jpeg;base64,${small.toJPEG(70).toString('base64')}`,
          rect: view.getBounds(),
        };
      },
    });
    overlayRef = overlay;
    /** The hidden sidebar slides out over the page while the pointer is on it (F-01). */
    function setSidebarPeek(open: boolean): void {
      const current = layout.current();
      // (Tabs on top: no sidebar to slide out.)
      if (open && (current.sidebar.visible || current.fullscreen || current.tabStrip)) return;
      overlay.setSidebarPeek(open ? current.sidebar.width : null);
      // The traffic lights come out with it, like Arc.
      win.setWindowButtonVisibility(open || current.sidebar.visible);
    }
    function closeSidebarPeek(): void {
      if (overlayRef?.sidebarPeekOpen) setSidebarPeek(false);
    }
    broadcaster.add(overlay.view.webContents); // downloads, for the slid-out sidebar's shelf

    peek = new PeekController({
      win,
      tabs: tabManager,
      overlay,
      getLayout: () => layout.current(),
    });
    const peekController = peek;
    library = new LibraryController({
      win,
      getLayout: () => layout.current(),
      setPanel: (panel) => layout.setLibrary(panel),
      internalPreload: this.deps.internalPreloadPath,
      loadInternal: this.deps.loadInternal,
      registerInternal: (webContentsId) => senders.add(webContentsId, 'internal'),
      unregisterInternal: (webContentsId) => senders.remove(webContentsId),
      onChange: (section) => {
        peek?.close();
        broadcaster.sendTo(contents, 'state:library', { section });
        toOverlay('state:library', { section });
      },
    });
    const libraryController = library;
    notes = new NotesPanelController({
      win,
      getLayout: () => layout.current(),
      setOpen: (open, wide) => layout.setNotes(open, wide),
      persist: (state) => settings.set('panel.state', state),
      internalPreload: this.deps.internalPreloadPath,
      loadInternal: this.deps.loadInternal,
      registerInternal: (webContentsId) => senders.add(webContentsId, 'internal'),
      unregisterInternal: (webContentsId) => senders.remove(webContentsId),
    });
    const notesPanel = notes;
    // The panel comes back where it was (roadmap P1.2: continue where you stopped).
    const panelState = settings.get('panel.state');
    if (panelState.open && notesHash(panelState.route) !== '/not-found') {
      notesPanel.restore(panelState.route);
    }

    const id = contents.id;
    const overlayId = overlay.view.webContents.id;
    const sidebar = new SidebarActions(this.deps.store, tabManager, {
      startRename: (target, renameId) =>
        broadcaster.sendTo(contents, 'rename:start', { target, id: renameId, at: Date.now() }),
      toast: (message) => broadcaster.sendTo(contents, 'toast:show', { message, at: Date.now() }),
      openCommandBar: () => overlay.openCommandBar('new'),
      command: (commandId) => this.deps.runCommand?.(controller, commandId),
      liveFolders: this.deps.liveFolders && {
        add: (kind, spaceId) => this.deps.liveFolders?.add(controller, kind, spaceId),
        refresh: (folderId) => this.deps.liveFolders?.refresh(folderId),
        markAllRead: (folderId) => this.deps.liveFolders?.markAllRead(folderId),
      },
    });
    const controller: WindowController = {
      win,
      layout,
      tabs: tabManager,
      overlay,
      find,
      media,
      peek: peekController,
      library: libraryController,
      notes: notesPanel,
      setSidebarPeek,
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
      peekController.close();
      libraryController.destroy();
      notesPanel.destroy();
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
