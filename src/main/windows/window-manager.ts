import { BrowserWindow, nativeTheme, dialog, screen } from 'electron';
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
import { VideoPopout } from '../media/popout';
import { LibraryController } from '../library/controller';
import { NotesPanelController } from '../notes/panel';
import { AppPanelController } from '../apps/panel';
import { notesHash } from '../notes/model';
import type { PageMenuRequest } from '../tabs/context-menu';
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
  /** Focus mode: a blocked site's navigation goes to Orbit's "blocked" page instead. */
  redirectFor?: (url: string) => string | null;
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
  capture?: (controller: WindowController, tabId: string, request: PageMenuRequest) => void;
  /** Tidy's state per space (F-29), shown in the space header. */
  tidyState?: TabManagerDeps['tidyState'];
  /** Live Folders (F-28), for the space and folder menus. */
  liveFolders?: {
    add: (controller: WindowController, kind: 'rss' | 'pulls' | 'issues', spaceId: string) => void;
    refresh: (folderId: string | null) => void;
    markAllRead: (folderId: string) => void;
  };
  /** A window's tabs changed (the assistant's page chip follows the page you're on). */
  onTabsChange?: (controller: WindowController) => void;
  /** Workspace templates (roadmap P2.5). */
  templates?: {
    save: (controller: WindowController, spaceId: string) => void;
    list: () => { id: string; name: string }[];
    use: (controller: WindowController, templateId: string) => void;
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
  /** A playing video in its own small floating window (owner request, like Arc). */
  popout: VideoPopout;
  peek: PeekController;
  library: LibraryController;
  /** The Notes panel on the right (F-33). */
  notes: NotesPanelController;
  /** A favourite's app docked on the right (App Hub, brief M5); shares the dock with Notes. */
  appPanel: AppPanelController;
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
    controller.overlay.openCommandBar(mode, initial);
  }

  /** The focused window (for menu commands), falling back to any window. */
  focused(): WindowController | undefined {
    const win = BrowserWindow.getFocusedWindow();
    const match = [...this.controllers.values()].find((c) => c.win === win);
    // With Settings (or another of Orbit's own windows) in front: the browser window last used.
    const last = this.lastMain && this.all().includes(this.lastMain) ? this.lastMain : undefined;
    return match ?? last ?? this.controllers.values().next().value;
  }

  // ── Settings window (owner request): Settings opens in a window of its own, like a Mac app's.

  private settingsWin: BrowserWindow | null = null;
  private lastMain: WindowController | null = null;

  /** Opens Settings in its window (or brings it forward), on a section if given. */
  openSettings(section?: string): void {
    const url = section ? `orbit://settings/${section}` : 'orbit://settings';
    const open = this.settingsWin;
    if (open && !open.isDestroyed()) {
      if (section) this.deps.loadInternal(open, url);
      if (open.isMinimized()) open.restore();
      open.show();
      open.focus();
      return;
    }
    const win = new BrowserWindow({
      width: 980,
      height: 720,
      minWidth: 620,
      minHeight: 460,
      title: 'Orbit Settings',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#161619' : '#f6f6f8',
      show: false,
      webPreferences: {
        preload: this.deps.internalPreloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.settingsWin = win;
    const contents = win.webContents;
    const id = contents.id;
    this.deps.senders.add(id, 'internal');
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Its own window: a strip along the top to drag it by (no title bar), and room for the
    // traffic lights above the nav. (Settings in a tab must not move the browser window.)
    contents.on('dom-ready', () => {
      void contents.insertCSS(
        `body::before { content: ''; position: fixed; inset: 0 0 auto 0; height: 34px;
           -webkit-app-region: drag; z-index: 50; }
         nav[aria-label='Settings'] { padding-top: 52px !important; }
         button, input, select, a { -webkit-app-region: no-drag; }`,
      );
    });
    win.once('ready-to-show', () => {
      // Test runs stay in the background (ORBIT_QUIET), like every other window.
      if (process.env['ORBIT_QUIET'] === '1') win.showInactive();
      else win.show();
    });
    win.on('closed', () => {
      this.deps.senders.remove(id);
      if (this.settingsWin === win) this.settingsWin = null;
    });
    this.deps.loadInternal(win, url);
  }

  /** Closes the Settings window if it's the one in front (⌘W there). */
  closeSettingsIfFocused(): boolean {
    const win = this.settingsWin;
    if (!win || win.isDestroyed() || BrowserWindow.getFocusedWindow() !== win) return false;
    win.close();
    return true;
  }

  /**
   * The browser window Settings acts for: when it's the Settings window, the window last used;
   * when it's Settings in a tab (orbit://settings typed in), that tab's window. Null otherwise.
   */
  settingsFor(webContentsId: number): WindowController | null {
    const win = this.settingsWin;
    if (win && !win.isDestroyed() && win.webContents.id === webContentsId) {
      return this.focused() ?? null;
    }
    const owner = this.tabForContents(webContentsId);
    return owner?.tab.state.url.startsWith('orbit://settings') ? owner.window : null;
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
    let splitsTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingSplits: Record<string, { ids: [string, string]; ratio: number }> | null = null;
    const flushSplits = () => {
      clearTimeout(splitsTimer);
      if (pendingSplits) settings.set('tabs.splits', pendingSplits);
      pendingSplits = null;
    };
    let peek: PeekController | null = null;
    let popout: VideoPopout | null = null;
    let library: LibraryController | null = null;
    let notes: NotesPanelController | null = null;
    let appPanel: AppPanelController | null = null;
    let overlayRef: OverlayController | null = null;
    let controllerRef: WindowController | null = null;
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
      appPanel?.fit();
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
      redirectFor: this.deps.redirectFor,
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
          const left = lastActiveTabId;
          lastActiveTabId = snapshot.activeTabId;
          find.close();
          // Leaving a tab that plays a video: it carries on in the pop-out (like Arc).
          if (left && settings.get('media.autoPopout') && media?.isPlaying(left)) {
            void popout?.popOut(left, { auto: true });
          }
        }
        media?.refresh(); // the mini player shows only while its tab is off screen
        peek?.refresh(); // a Peek shows over its own tab only (Arc)
        if (controllerRef) this.deps.onTabsChange?.(controllerRef);
      },
      onHtmlFullscreen: (enter) => setHtmlFullscreen(enter),
      onSplitChange: (ratio) => layout.setSplitRatio(ratio),
      // Saved split layouts (roadmap P2.4): written once a drag settles (or the window closes).
      initialSplits: settings.get('tabs.splits'),
      onSplitsChange: (splits) => {
        pendingSplits = splits;
        clearTimeout(splitsTimer);
        splitsTimer = setTimeout(flushSplits, 300);
      },
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
      peekOf: (tabId) => peek?.badge(tabId) ?? null,
      onReclaim: (tabId) => popout?.reclaim(tabId),
    });
    const tabManager = tabs;
    const media = new MediaController(
      tabManager,
      (state) => {
        broadcaster.sendTo(contents, 'state:media', state);
        toOverlay('state:media', state);
      },
      (tabId) => void popout?.popOut(tabId, { auto: false }),
    );
    const videoPopout = new VideoPopout({
      tabs: tabManager,
      main: win,
      internalPreload: this.deps.internalPreloadPath,
      loadInternal: this.deps.loadInternal,
      registerInternal: (webContentsId) => senders.add(webContentsId, 'internal'),
      unregisterInternal: (webContentsId) => senders.remove(webContentsId),
      send: (target, view) => broadcaster.sendTo(target, 'popout:update', view),
      onChange: () => media.refresh(),
      // The mini player's place: the foot of the sidebar.
      dockTarget: () => {
        if (win.isDestroyed() || win.isMinimized() || !win.isVisible()) return null;
        const b = win.getContentBounds();
        const { sidebar } = layout.current();
        const width = sidebar.visible ? Math.max(120, sidebar.width - 16) : 200;
        return { x: b.x + 8, y: b.y + b.height - 118, width, height: 76 };
      },
    });
    popout = videoPopout;

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
      activeTabId: () => tabManager.activeItemId,
      exists: (tabId) => this.deps.store.item(tabId) !== undefined,
      onBadgesChange: () => tabManager.refresh(),
    });
    const peekController = peek;
    // The command bar, a prompt, Site Controls…: the Peek steps aside, then comes back.
    overlay.onBusyChange = (busy) => peekController.hold('overlay', busy);
    library = new LibraryController({
      win,
      getLayout: () => layout.current(),
      setPanel: (panel) => layout.setLibrary(panel),
      internalPreload: this.deps.internalPreloadPath,
      loadInternal: this.deps.loadInternal,
      registerInternal: (webContentsId) => senders.add(webContentsId, 'internal'),
      unregisterInternal: (webContentsId) => senders.remove(webContentsId),
      onChange: (section) => {
        peek?.hold('library', section !== null);
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
      onOpen: () => appPanel?.close(),
    });
    const notesPanel = notes;
    // App Hub: a favourite's app docked beside the page (brief M5).
    appPanel = new AppPanelController({
      getLayout: () => layout.current(),
      setDockOpen: (open) => layout.setNotes(open, false),
      createPage: (url, itemId, onChange) => tabManager.createDetached(url, itemId, onChange),
      attach: (view) => win.contentView.addChildView(view, 0),
      detach: (view) => {
        if (!win.isDestroyed()) win.contentView.removeChildView(view);
      },
      adopt: (page) => tabManager.adopt(page),
      push: (state) => broadcaster.sendTo(contents, 'state:appPanel', state),
      closeNotes: () => notesPanel.close(),
    });
    const appPanelController = appPanel;
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
      templates: this.deps.templates && {
        save: (spaceId) => this.deps.templates?.save(controller, spaceId),
        list: () => this.deps.templates?.list() ?? [],
        use: (templateId) => this.deps.templates?.use(controller, templateId),
      },
    });
    const controller: WindowController = (controllerRef = {
      win,
      layout,
      tabs: tabManager,
      overlay,
      find,
      media,
      popout: videoPopout,
      peek: peekController,
      library: libraryController,
      notes: notesPanel,
      appPanel: appPanelController,
      setSidebarPeek,
      store: this.deps.store,
      sidebar,
    });
    this.controllers.set(id, controller);
    this.controllers.set(overlayId, controller);
    this.lastMain = controller;
    win.on('focus', () => {
      this.lastMain = controller;
    });
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
      flushSplits();
      this.deps.store.flushLive(); // the sidebar store saves structure at once; live details now
    });
    win.on('closed', () => {
      peekController.closeAll();
      videoPopout.close();
      libraryController.destroy();
      notesPanel.destroy();
      appPanelController.destroy();
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
