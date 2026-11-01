import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import type { Session } from 'electron';
import type { WebContentsView } from 'electron';
import { APP_NAME, isInternalPage } from '@shared/constants';
import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import type { RendererEntry } from '@shared/constants';
import { chromeUserAgent } from './app/user-agent';
import { Broadcaster } from './ipc/broadcaster';
import { CommandBarService, copyActiveUrl } from './commandbar/service';
import { registerAppHandlers } from './ipc/handlers/app';
import { registerCommandBarHandlers } from './ipc/handlers/command-bar';
import { registerFindHandlers } from './ipc/handlers/find';
import { registerInternalPageHandlers } from './ipc/handlers/internal-pages';
import { registerSidebarHandlers } from './ipc/handlers/sidebar';
import { registerLayoutHandlers } from './ipc/handlers/layout';
import { registerNewTabHandlers } from './ipc/handlers/newtab';
import { navigateTab, registerTabHandlers } from './ipc/handlers/tabs';
import { WallpaperService } from './newtab/wallpaper-service';
import { installAppMenu } from './menus/app-menu';
import { IpcRouter } from './ipc/router';
import { SenderRegistry } from './ipc/sender';
import { openPersistence } from './persistence';
import { backupDatabase } from './persistence/backup';
import { clampZoom } from './persistence/repositories/site-settings';
import type { Persistence } from './persistence';
import { SidebarStore } from './sidebar/store';
import { TabLifecycle } from './archive/lifecycle';
import { DownloadService } from './downloads/service';
import { setSearchEngine } from './omnibox/classify';
import { SEARCH_ENGINES } from '@shared/settings';
import { PermissionService } from './permissions/service';
import { ArcImporter, findArcSources } from './importer/arc/import';
import { WindowManager } from './windows/window-manager';
import { acceptExternalUrl, LittleWindow } from './windows/little';
import type { WindowController } from './windows/window-manager';

app.setName(APP_NAME);

// Sites see a plain Chrome, not "Electron" (Google sign-in rejects embedded browsers; §4.9 #1).
app.userAgentFallback = chromeUserAgent(process.versions.chrome ?? '0');

// Tests (and side-by-side dev instances) use their own profile so they never touch real data.
// Must run before the single-instance lock, which is keyed on the userData path.
const userDataOverride = process.env['ORBIT_USER_DATA_DIR'];
if (userDataOverride) app.setPath('userData', userDataOverride);

// One Orbit at a time; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const devServer = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererDir = join(import.meta.dirname, '../renderer');

// Only Orbit's own pages may talk to main: the dev server in development, the bundled files otherwise.
const senders = new SenderRegistry(
  devServer ? [`${new URL(devServer).origin}/`] : [pathToFileURL(`${rendererDir}/`).href],
);
const broadcaster = new Broadcaster();

let persistence: Persistence | null = null;
let sidebarStore: SidebarStore | null = null;
let lifecycle: TabLifecycle | null = null;
let downloadService: DownloadService | null = null;
let arcImporter: ArcImporter | null = null;

// A stray error in main must never show Electron's blocking error dialog (a browser that can't
// quit is worse than one that logs). Logged for debugging instead.
process.on('uncaughtException', (error) => console.error('[orbit] uncaught exception', error));
process.on('unhandledRejection', (reason) => console.error('[orbit] unhandled rejection', reason));
let windows: WindowManager | null = null;

function loadRenderer(win: BrowserWindow, entry: RendererEntry, query?: string): void {
  if (devServer) void win.loadURL(`${devServer}/${entry}/index.html${query ? `?${query}` : ''}`);
  else void win.loadFile(join(rendererDir, entry, 'index.html'), query ? { search: query } : {});
}

// ── Links from other apps (default browser) → Little Orbit (F-24) ────────────
const littleWindows = new Map<number, LittleWindow>();
const pendingUrls: string[] = [];
let openLittle: ((url: string) => void) | null = null;

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!acceptExternalUrl(url)) return;
    if (openLittle) openLittle(url);
    else pendingUrls.push(url); // arrived before Orbit finished starting
  });
});

/** orbit://<page> → the internal renderer with `#/<page>`. Unknown pages show "not found". */
function loadInternal(view: WebContentsView, url: string): void {
  const page = new URL(url).hostname;
  const hash = `/${isInternalPage(page) ? page : 'not-found'}`;
  if (devServer) void view.webContents.loadURL(`${devServer}/internal/index.html#${hash}`);
  else void view.webContents.loadFile(join(rendererDir, 'internal', 'index.html'), { hash });
}

function loadOverlay(view: WebContentsView): void {
  if (devServer) void view.webContents.loadURL(`${devServer}/overlay/index.html`);
  else void view.webContents.loadFile(join(rendererDir, 'overlay', 'index.html'));
}

/** A short confirmation shown in the toolbar (⇧⌘C "Copied link", zoom level…). */
function toast(controller: WindowController, message: string): void {
  broadcaster.sendTo(controller.win.webContents, 'toast:show', { message, at: Date.now() });
}

/** ⌘+ / ⌘− / ⌘0 on the active page; remembered per site. */
function zoom(controller: WindowController, action: 'in' | 'out' | 'reset'): void {
  const tab = controller.tabs.active;
  if (!tab || tab.state.kind !== 'web' || !persistence) return;
  const contents = tab.view.webContents;
  const current = contents.getZoomLevel();
  const level = clampZoom(action === 'reset' ? 0 : current + (action === 'in' ? 0.5 : -0.5));
  contents.setZoomLevel(level);
  persistence.siteSettings.setZoom(tab.state.url, level);
  toast(controller, `Zoom ${Math.round(Math.pow(1.2, level) * 100)}%`);
}

/**
 * File → Import from Arc… (F-27): finds the backup, previews it, imports on confirmation, and
 * switches to the first imported space.
 */
async function importFromArc(controller: WindowController): Promise<void> {
  if (!arcImporter) return;
  const override = process.env['ORBIT_ARC_DIR'];
  let source = override ?? findArcSources()[0];
  if (!source) {
    const picked = await dialog.showOpenDialog(controller.win, {
      title: 'Choose your Arc backup folder',
      message: 'Choose the folder that contains StorableSidebar.json',
      properties: ['openDirectory'],
    });
    source = picked.filePaths[0];
    if (picked.canceled || !source) return;
  }
  let preview;
  try {
    preview = arcImporter.preview(source);
  } catch (error) {
    await dialog.showMessageBox(controller.win, {
      type: 'error',
      message: 'This folder can’t be imported',
      detail: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const { response } = await dialog.showMessageBox(controller.win, {
    type: 'question',
    message: 'Import from Arc?',
    detail:
      `From ${source}\n\n` +
      `${preview.spaces} spaces (${preview.spaceNames.join(', ')})\n` +
      `${preview.favorites} favorites · ${preview.pinned} pinned tabs · ${preview.today} Today tabs\n` +
      `${preview.history.toLocaleString()} history entries\n\n` +
      'Running it again later won’t create duplicates. Passwords and cookies aren’t imported — ' +
      'sign in once per site.',
    buttons: ['Import', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  const result = arcImporter.import(source);
  const firstArcSpace = sidebarStore?.spaces.find((s) => s.id.startsWith('arc-'));
  if (firstArcSpace) controller.tabs.switchSpace(firstArcSpace.id);
  toast(
    controller,
    result.spacesAdded > 0
      ? `Imported ${result.spacesAdded} spaces, ${result.favoritesAdded} favorites, ${result.tabsAdded} tabs`
      : 'Already imported — nothing new',
  );
}

/** Runs a command by id for a window (command bar items and menu items share these). */
function runCommand(controller: WindowController, commandId: string): void {
  const { tabs, layout } = controller;
  switch (commandId) {
    case 'new-tab-page':
      tabs.create();
      return;
    case 'toggle-sidebar':
      layout.toggleSidebar();
      return;
    case 'copy-url':
      if (copyActiveUrl(controller)) toast(controller, 'Copied link');
      return;
    case 'reload':
      if (tabs.active) navigateTab(tabs.active, 'reload');
      return;
    case 'close-tab':
      if (tabs.active) tabs.close(tabs.active.id);
      return;
    case 'reopen-tab':
      tabs.reopenClosed();
      return;
    case 'import-arc':
      void importFromArc(controller);
      return;
    case 'new-space':
      controller.sidebar.newSpace();
      return;
    case 'archived-tabs':
      controller.tabs.create('orbit://archive');
      return;
    case 'settings':
      controller.tabs.create('orbit://settings');
      return;
  }
}

// HTTP authentication (F-31): ask for a username and password in the page's window.
app.on('login', (event, contents, details, authInfo, callback) => {
  const owner = contents ? windows?.tabForContents(contents.id) : null;
  if (!owner) return; // let it fail (popups, background requests)
  event.preventDefault();
  void owner.window.overlay
    .ask({ kind: 'login', host: authInfo.host, realm: authInfo.realm || details.url })
    .then((answer) => {
      if (answer.allow && answer.username !== undefined)
        callback(answer.username, answer.password ?? '');
      else callback();
    });
});

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  if (windows && BrowserWindow.getAllWindows().length === 0) windows.createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  lifecycle?.stop();
  sidebarStore?.close();
  persistence?.close();
  persistence = null;
});

void app.whenReady().then(() => {
  persistence = openPersistence(app.getPath('userData'));
  const store = new SidebarStore(persistence.sidebar);
  sidebarStore = store;
  arcImporter = new ArcImporter(store, persistence.history);
  /** One session per profile (F-17). The default profile keeps Electron's default session, so
   *  logins from before profiles existed carry over. */
  // Downloads go straight to ~/Downloads (tests use their own folder) and show on the shelf.
  const downloads = new DownloadService(
    persistence.db,
    () => process.env['ORBIT_DOWNLOADS_DIR'] ?? app.getPath('downloads'),
    (snapshot) => broadcaster.send('state:downloads', snapshot),
  );
  downloadService = downloads;

  // Site permissions: ask in the window's overlay, remember per site (F-31).
  const permissions = new PermissionService(persistence.siteSettings, (contents) => {
    const owner = windows?.tabForContents(contents.id);
    return owner?.window.overlay ?? null;
  });
  const sessionFor = (profileId: string): Session | undefined => {
    const profile = store.profiles.find((p) => p.id === profileId);
    const s =
      !profile || profile.id === DEFAULT_PROFILE_ID
        ? session.defaultSession
        : session.fromPartition(profile.partition);
    permissions.configure(s); // once per session
    downloads.configure(s, profileId);
    return s;
  };
  sessionFor(DEFAULT_PROFILE_ID);
  windows = new WindowManager({
    settings: persistence.settings,
    store,
    archive: persistence.archive,
    sessionFor,
    history: persistence.history,
    zoomFor: (url) => persistence?.siteSettings.zoomFor(url) ?? 0,
    senders,
    broadcaster,
    preloadPath: join(import.meta.dirname, '../preload/shell.cjs'),
    internalPreloadPath: join(import.meta.dirname, '../preload/internal.cjs'),
    loadRenderer,
    loadInternal,
    loadOverlay,
  });
  const windowManager = windows;

  // Handlers are registered before any window loads, so the shell's first call always lands.
  const router = new IpcRouter(ipcMain, senders);
  registerAppHandlers(router);
  registerLayoutHandlers(router, windowManager);
  registerTabHandlers(router, windowManager);
  registerNewTabHandlers(
    router,
    windowManager,
    new WallpaperService(app.getPath('userData'), persistence.settings),
  );
  registerFindHandlers(router, windowManager);
  registerSidebarHandlers(router, windowManager);
  router.handle(
    'media:get',
    (_i, { sender }) => windowManager.forSender(sender.webContentsId)?.media.current() ?? null,
  );
  router.handle('media:control', async ({ action }, { sender }) => {
    await windowManager.forSender(sender.webContentsId)?.media.control(action);
  });
  router.handle('little:get', (_i, { sender }) => {
    const little = littleWindows.get(sender.webContentsId);
    return { url: little?.url ?? '', title: little?.title ?? '' };
  });
  router.handle('little:promote', (_i, { sender }) => {
    littleWindows.get(sender.webContentsId)?.promote();
  });
  router.handle('browser:defaultStatus', () => ({
    isDefault: app.isDefaultProtocolClient('https'),
  }));
  router.handle('browser:makeDefault', () => {
    // macOS asks the user to confirm; the packaged app must be the one registering.
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
    return { isDefault: app.isDefaultProtocolClient('https') };
  });
  router.handle('downloads:get', () => downloadService?.snapshot() ?? { items: [] });
  router.handle('downloads:act', async ({ id, action }, { sender }) => {
    const service = downloadService;
    if (!service) return;
    if (action === 'open') service.open(id);
    else if (action === 'reveal') service.reveal(id);
    else if (action === 'cancel') service.cancel(id);
    else if (action === 'dismiss') service.dismiss(id);
    else {
      const contents = windowManager.forSender(sender.webContentsId)?.win.webContents;
      if (contents) await service.startDrag(id, contents);
    }
  });
  registerInternalPageHandlers(router, windowManager, {
    archive: persistence.archive,
    settings: persistence.settings,
    history: persistence.history,
  });
  registerCommandBarHandlers(
    router,
    windowManager,
    new CommandBarService(
      persistence.history,
      runCommand,
      process.env['ORBIT_DISABLE_SUGGESTIONS'] !== '1',
    ),
  );
  router.assertComplete();

  installAppMenu({
    toggleSidebar: () => windowManager.focused()?.layout.toggleSidebar(),
    openCommandBar: (mode) => {
      const controller = windowManager.focused();
      if (controller) windowManager.openCommandBar(controller, mode);
    },
    newTabPage: () => windowManager.focused()?.tabs.create(),
    command: (id) => {
      const controller = windowManager.focused();
      if (controller) runCommand(controller, id);
    },
    copyUrlAsMarkdown: () => {
      const controller = windowManager.focused();
      if (controller && copyActiveUrl(controller, true)) toast(controller, 'Copied as Markdown');
    },
    find: (action) => {
      const controller = windowManager.focused();
      if (!controller) return;
      if (action === 'open') {
        controller.find.open();
        controller.win.webContents.focus(); // the find field lives in the shell's toolbar
      } else {
        controller.find.step(action);
      }
    },
    zoom: (action) => {
      const controller = windowManager.focused();
      if (controller) zoom(controller, action);
    },
    print: () => windowManager.focused()?.tabs.active?.view.webContents.print(),
    togglePin: () => {
      const controller = windowManager.focused();
      const id = controller?.tabs.activeItemId;
      if (controller && id) controller.sidebar.togglePin(id);
    },
    newSpace: () => windowManager.focused()?.sidebar.newSpace(),
    newFolder: () => windowManager.focused()?.sidebar.newFolder('pinned'),
    runLifecycle: () => {
      const result = lifecycle?.runNow();
      const controller = windowManager.focused();
      if (result && controller)
        toast(controller, `Archived ${result.archived}, slept ${result.slept}`);
    },
    importFromArc: () => {
      const controller = windowManager.focused();
      if (controller) void importFromArc(controller);
    },
    goToSpace: (n) => {
      const controller = windowManager.focused();
      const space = store.spaces[n - 1];
      if (controller && space) controller.tabs.switchSpace(space.id);
    },
    cycleSpace: (direction) => windowManager.focused()?.tabs.cycleSpace(direction),
    navigate: (action) => {
      const active = windowManager.focused()?.tabs.active;
      if (active) navigateTab(active, action);
    },
    cycleTab: (direction) => windowManager.focused()?.tabs.cycle(direction),
    goToTab: (n) => windowManager.focused()?.tabs.activateIndex(n),
    toggleTabDevTools: () => {
      const contents = windowManager.focused()?.tabs.active?.view.webContents;
      if (!contents) return;
      if (contents.isDevToolsOpened()) contents.closeDevTools();
      else contents.openDevTools({ mode: 'detach' });
    },
  });
  // Search engine from Settings (and kept in sync when it changes there).
  setSearchEngine(SEARCH_ENGINES[persistence.settings.get('search.engine')].url);

  lifecycle = new TabLifecycle(() => windowManager.all().map((c) => c.tabs), persistence.settings);
  lifecycle.start();

  // Daily database backup and archive trim, a few seconds after launch (never blocks startup).
  const db = persistence;
  setTimeout(() => {
    try {
      backupDatabase(db.db, join(app.getPath('userData'), 'backups'));
      db.archive.prune();
    } catch (error) {
      console.error('[orbit] backup failed', error);
    }
  }, 5_000);

  /** Opens a URL as a tab in the main window (reopening the window if it was closed). */
  const openInMain = (url: string) => {
    const controller = windowManager.focused() ?? windowManager.all()[0];
    if (!controller) {
      windowManager.createMainWindow();
      setTimeout(() => windowManager.all()[0]?.tabs.create(url), 300);
      return;
    }
    controller.tabs.create(url);
    controller.win.show();
    controller.win.focus();
  };
  openLittle = (url: string) => {
    const little = new LittleWindow(url, {
      preloadPath: join(import.meta.dirname, '../preload/shell.cjs'),
      loadRenderer,
      register: (id) => senders.add(id, 'shell'),
      unregister: (id) => senders.remove(id),
      openInMain,
      send: (bar, state) => broadcaster.sendTo(bar, 'little:state', state),
    });
    const barId = little.win.webContents.id;
    littleWindows.set(barId, little);
    little.win.on('closed', () => littleWindows.delete(barId));
  };

  windowManager.createMainWindow();
  for (const url of pendingUrls.splice(0)) openLittle(url);
});
