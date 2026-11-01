import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  safeStorage,
  session,
  shell,
} from 'electron';
import type { Session } from 'electron';
import type { WebContentsView } from 'electron';
import { APP_NAME, isInternalPage } from '@shared/constants';
import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import type { RendererEntry } from '@shared/constants';
import { chromeUserAgent } from './app/user-agent';
import { Broadcaster } from './ipc/broadcaster';
import { CommandBarService, copyActiveUrl } from './commandbar/service';
import { registerAppHandlers } from './ipc/handlers/app';
import { ExtensionHost } from './extensions/host';
import { registerSiteControlsHandlers } from './ipc/handlers/site-controls';
import { openBoostEditor, registerBoostHandlers } from './ipc/handlers/boosts';
import { BoostService } from './boosts/service';
import { domainForPage } from './boosts/model';
import { boostIdSchema } from '@shared/types/boosts';
import { librarySectionSchema } from '@shared/types/library';
import { easelIdSchema } from '@shared/types/easels';
import { newEasel, registerEaselHandlers } from './ipc/handlers/easels';
import { CaptureRequests } from './easels/capture-requests';
import { registerLibraryHandlers } from './ipc/handlers/library';
import { MediaLibrary } from './library/media';
import { LiveFolderService } from './live-folders/service';
import { AiKeyStore, cleanApiKey } from './ai/key-store';
import type { Cipher } from './ai/key-store';
import { AIService, TIDY_MODEL } from './ai/service';
import { TidyService } from './ai/tidy';
import { feedInputUrl, githubRepo } from './live-folders/model';
import type { LiveSource } from '@shared/types/live-folders';
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
import { classifyInput, setSearchEngine } from './omnibox/classify';
import { SEARCH_ENGINES } from '@shared/settings';
import { PermissionService } from './permissions/service';
import { ArcImporter, findArcSources } from './importer/arc/import';
import { WindowManager } from './windows/window-manager';
import { acceptExternalUrl, LittleWindow } from './windows/little';
import type { WindowController } from './windows/window-manager';
import { notesHash } from './notes/model';
import { enableQuietMode } from './app/quiet';
import { registerProfileHandlers } from './ipc/handlers/profiles';
import { FloatingNotes } from './notes/floating';
import { newNoteTab, noteUrl, registerNotesHandlers, toggleQuickNote } from './ipc/handlers/notes';
import { noteIdSchema } from '@shared/types/notes';

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

// Automated test runs: windows open without stealing focus (see quiet.ts). Before launch
// finishes, so the app is never activated at all.
if (!app.isPackaged && process.env['ORBIT_QUIET'] === '1') enableQuietMode();

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
let boostService: BoostService | null = null;
let liveFolders: LiveFolderService | null = null;
/** Tidy for a window's space, with its toast (the space header, the sidebar's menu). */
let runTidy: ((controller: WindowController) => Promise<void>) | null = null;

// A stray error in main must never show Electron's blocking error dialog (a browser that can't
// quit is worse than one that logs). Logged for debugging instead.
process.on('uncaughtException', (error) => console.error('[orbit] uncaught exception', error));
process.on('unhandledRejection', (reason) => console.error('[orbit] unhandled rejection', reason));
let windows: WindowManager | null = null;
let floatingNotes: FloatingNotes | null = null;

function loadRenderer(win: BrowserWindow, entry: RendererEntry, query?: string): void {
  if (devServer) void win.loadURL(`${devServer}/${entry}/index.html${query ? `?${query}` : ''}`);
  else void win.loadFile(join(rendererDir, entry, 'index.html'), query ? { search: query } : {});
}

// ── Links from other apps (default browser) → Little Orbit (F-24) ────────────
const littleWindows = new Map<number, LittleWindow>();
const pendingUrls: string[] = [];
let openLittle: ((url: string | null) => void) | null = null;
/** ⌥⌘N, from any app (F-24). */
const LITTLE_SHORTCUT = 'Alt+CommandOrControl+N';
let lastEmptyLittle = 0;
/** The menu accelerator and the global shortcut can both fire for one press; open one window. */
function openEmptyLittle(): void {
  if (Date.now() - lastEmptyLittle < 400) return;
  lastEmptyLittle = Date.now();
  openLittle?.(null);
}
function applyLittleShortcut(enabled: boolean): void {
  if (globalShortcut.isRegistered(LITTLE_SHORTCUT)) globalShortcut.unregister(LITTLE_SHORTCUT);
  // Fails quietly if another app owns the shortcut; the menu item still works inside Orbit.
  if (enabled) globalShortcut.register(LITTLE_SHORTCUT, openEmptyLittle);
}

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!acceptExternalUrl(url)) return;
    if (openLittle) openLittle(url);
    else pendingUrls.push(url); // arrived before Orbit finished starting
  });
});

/** orbit://<page> → the internal renderer with `#/<page>` (`#/boost/<id>` for a Boost's editor).
 *  Unknown pages show "not found". */
function loadInternal(view: { webContents: Electron.WebContents }, url: string): void {
  const { hostname: page, pathname } = new URL(url);
  const param = pathname.slice(1);
  let hash = `/${isInternalPage(page) ? page : 'not-found'}`;
  // Pages with a parameter: a Boost's editor, a Library section.
  if (page === 'boost')
    hash = boostIdSchema.safeParse(param).success ? `/boost/${param}` : '/not-found';
  if (page === 'easel')
    hash = easelIdSchema.safeParse(param).success ? `/easel/${param}` : '/not-found';
  if (page === 'library')
    hash = librarySectionSchema.safeParse(param).success ? `/library/${param}` : '/not-found';
  // Settings can open on a section (orbit://settings/profiles).
  if (page === 'settings' && /^(general|profiles|shortcuts|ai|privacy|about)$/.test(param))
    hash = `/settings/${param}`;
  // A note's tab (note/<id>), the Notes panel (notes/panel[/<id>]), a floating note (notes/float/<id>).
  if (page === 'note')
    hash = noteIdSchema.safeParse(param).success ? `/note/${param}` : '/not-found';
  if (page === 'notes') hash = notesHash(param);
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

const LIVE_PROMPTS = {
  rss: {
    title: 'Add an RSS Feed',
    message: 'A feed address, or a site that has one. New posts appear in a folder.',
    placeholder: 'example.com/blog',
  },
  pulls: {
    title: 'Add GitHub Pull Requests',
    message: 'Open pull requests of a repository, kept up to date in a folder.',
    placeholder: 'owner/repository',
  },
  issues: {
    title: 'Add GitHub Issues',
    message: 'Open issues of a repository, kept up to date in a folder.',
    placeholder: 'owner/repository',
  },
} as const;

/** Space menu → Live Folders › Add… (F-28): ask for the source, check it, add the folder. */
async function addLiveFolder(
  controller: WindowController,
  kind: 'rss' | 'pulls' | 'issues',
  spaceId: string,
): Promise<void> {
  const space = sidebarStore?.space(spaceId);
  if (!liveFolders || !space) return;
  const answer = await controller.overlay.ask({
    kind: 'input',
    ...LIVE_PROMPTS[kind],
    confirm: 'Add',
  });
  if (!answer.allow || !answer.value) return;
  let source: LiveSource | null;
  if (kind === 'rss') {
    const url = feedInputUrl(answer.value);
    source = url ? { type: 'rss', url } : null;
  } else {
    const repo = githubRepo(answer.value);
    source = repo ? { type: 'github', repo, what: kind } : null;
  }
  if (!source) {
    toast(controller, kind === 'rss' ? 'That isn’t a web address' : 'Use owner/repository');
    return;
  }
  try {
    const folder = await liveFolders.create(source, space);
    toast(controller, `Added ${folder.title}`);
  } catch (error) {
    toast(controller, `Couldn’t add it: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    case 'split-view':
      tabs.splitWithNew();
      return;
    case 'exit-split':
      tabs.exitSplit();
      return;
    case 'swap-split':
      tabs.swapSplit();
      return;
    case 'archived-tabs':
      controller.tabs.create('orbit://archive');
      return;
    case 'settings':
      controller.tabs.create('orbit://settings');
      return;
    case 'new-easel':
      if (persistence) newEasel(persistence.easels, controller);
      return;
    case 'new-note':
      if (persistence) newNoteTab(persistence.notes, controller);
      return;
    case 'quick-note':
      if (persistence) toggleQuickNote(persistence.notes, controller);
      return;
    case 'toggle-notes':
      controller.notes.toggle();
      return;
    case 'float-note':
      if (persistence) floatingNotes?.show(persistence.notes.create());
      return;
    case 'live-rss':
    case 'live-pulls':
    case 'live-issues':
      void addLiveFolder(
        controller,
        commandId === 'live-rss' ? 'rss' : commandId === 'live-pulls' ? 'pulls' : 'issues',
        tabs.space.id,
      );
      return;
    case 'live-refresh':
      void liveFolders?.refreshAll().then(() => toast(controller, 'Live Folders refreshed'));
      return;
    case 'manage-spaces':
      controller.library.open('spaces');
      return;
    case 'tidy':
      void runTidy?.(controller);
      return;
    case 'library':
      controller.library.open('media');
      return;
    case 'new-boost': {
      const page = tabs.active?.state.kind === 'web' ? tabs.active.state.url : '';
      if (boostService) openBoostEditor(controller, boostService.create(domainForPage(page)).id);
      return;
    }
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
  // Floating notes are windows too: reopen the main window whenever none is open.
  if (windows && windows.all().length === 0) windows.createMainWindow();
});

app.on('before-quit', () => {
  floatingNotes?.willQuit(); // they close with the app, but reopen next launch
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  lifecycle?.stop();
  liveFolders?.stop();
  sidebarStore?.close();
  persistence?.close();
  persistence = null;
});

void app.whenReady().then(() => {
  // The packaged app gets its icon from the bundle; in development, show it in the Dock too.
  if (!app.isPackaged) app.dock?.setIcon(join(import.meta.dirname, '../../resources/icon.png'));
  persistence = openPersistence(app.getPath('userData'));
  const store = new SidebarStore(persistence.sidebar);
  sidebarStore = store;
  arcImporter = new ArcImporter(store, persistence.history);
  // Boosts (F-18) reach every page Electron creates — tabs, Peek, Little Orbit, popups — but
  // never Orbit's own UI (which, in development, is served from localhost).
  const devOrigin = devServer ? new URL(devServer).origin : null;
  const boosts = new BoostService(
    persistence.boosts,
    (contents) =>
      senders.has(contents.id) || (devOrigin !== null && contents.getURL().startsWith(devOrigin)),
  );
  boostService = boosts;
  // Live Folders (F-28): fetched by main (never by a page), in the default session.
  const live = new LiveFolderService({
    store,
    fetch: (url, init) => net.fetch(url, init),
    isOpen: (itemId) => windows?.all().some((c) => c.tabs.get(itemId) !== undefined) ?? false,
  });
  liveFolders = live;
  live.start();

  // AI (F-29): the user's Anthropic key, Keychain-encrypted. Development builds can point the
  // SDK at a stand-in server and skip the Keychain (the e2e tests do; packaged Orbit never).
  const devOnly = (name: string) => (app.isPackaged ? undefined : process.env[name]);
  const testCipher: Cipher | null = devOnly('ORBIT_TEST_PLAIN_KEYS')
    ? {
        isEncryptionAvailable: () => true,
        encryptString: (text) => Buffer.from(text, 'utf8'),
        decryptString: (data) => data.toString('utf8'),
      }
    : null;
  const keyStore = new AiKeyStore(
    join(app.getPath('userData'), 'anthropic-key.bin'),
    testCipher ?? safeStorage,
  );
  const ai = new AIService({
    apiKey: () => keyStore.get(),
    baseURL: devOnly('ORBIT_ANTHROPIC_BASE_URL'),
  });
  const refreshSidebars = () => windows?.all().forEach((c) => c.tabs.refresh());
  const tidy = new TidyService({ store, ai, onChange: refreshSidebars });
  app.on('web-contents-created', (_event, contents) => boosts.attach(contents));
  /** One session per profile (F-17). The default profile keeps Electron's default session, so
   *  logins from before profiles existed carry over. */
  // Downloads go straight to ~/Downloads (tests use their own folder) and show on the shelf.
  const downloads = new DownloadService(
    persistence.db,
    () => process.env['ORBIT_DOWNLOADS_DIR'] ?? app.getPath('downloads'),
    (snapshot) => broadcaster.send('state:downloads', snapshot),
    // Arc's flourish: the download flies from its page into the sidebar's shelf.
    (from) => {
      const owner = windows?.tabForContents(from.id);
      if (!owner) return;
      const { window, tab } = owner;
      const page = tab.view.getBounds();
      // A tab opened only to download (its first and only navigation) closes, like Chrome and
      // Arc — the file is on the shelf, an empty tab would be left behind.
      const history = from.navigationHistory;
      if (history.length() <= 1 && !history.canGoBack() && tab.state.kind === 'web') {
        const committed = from.getURL();
        if (committed === '' || committed === tab.state.url) {
          setTimeout(() => window.tabs.close(tab.id), 0);
        }
      }
      const layout = window.layout.current();
      const [, height = 0] = window.win.getContentSize();
      window.overlay.flyDownload(
        { x: page.x + page.width / 2, y: page.y + Math.min(page.height / 2, 260) },
        layout.sidebar.visible ? { x: 34, y: height - 86 } : { x: 22, y: height - 30 },
      );
    },
  );
  downloadService = downloads;
  const captures = new CaptureRequests();
  const media = new MediaLibrary(join(app.getPath('userData'), 'Captures'), downloads);

  // Site permissions: ask in the window's overlay, remember per site (F-31).
  const permissions = new PermissionService(persistence.siteSettings, (contents) => {
    const owner = windows?.tabForContents(contents.id);
    return owner?.window.overlay ?? null;
  });
  // Chrome extensions (ADR-008): chrome.tabs calls land in the focused window.
  const extensionHost = new ExtensionHost({
    createTab: (url, active) => {
      const controller = windows?.focused();
      if (!controller) return null;
      const tab = controller.tabs.create(url, { activate: active });
      return [tab.view.webContents, controller.win];
    },
    selectTab: (contents) => {
      const owner = windows?.tabForContents(contents.id);
      owner?.window.tabs.activate(owner.tab.id);
    },
    removeTab: (contents) => {
      const owner = windows?.tabForContents(contents.id);
      owner?.window.tabs.close(owner.tab.id);
    },
  });
  // Extension updates: a minute after launch, then every 6 hours.
  const updateExtensions = () => void extensionHost.update();
  setTimeout(updateExtensions, 60_000).unref();
  setInterval(updateExtensions, 6 * 3_600_000).unref();
  const sessionFor = (profileId: string): Session | undefined => {
    const profile = store.profiles.find((p) => p.id === profileId);
    const s =
      !profile || profile.id === DEFAULT_PROFILE_ID
        ? session.defaultSession
        : session.fromPartition(profile.partition);
    permissions.configure(s); // once per session
    downloads.configure(s, profileId);
    void extensionHost.configure(s);
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
    extensions: extensionHost,
    siteSetting: (url, key) => {
      try {
        return persistence?.siteSettings.get(new URL(url).origin, key) ?? null;
      } catch {
        return null;
      }
    },
    senders,
    broadcaster,
    preloadPath: join(import.meta.dirname, '../preload/shell.cjs'),
    internalPreloadPath: join(import.meta.dirname, '../preload/internal.cjs'),
    loadRenderer,
    loadInternal,
    loadOverlay,
    runCommand,
    tidyState: (spaceId) => tidy.state(spaceId),
    liveFolders: {
      add: (controller, kind, spaceId) => void addLiveFolder(controller, kind, spaceId),
      refresh: (folderId) => void (folderId ? live.refresh(folderId) : live.refreshAll()),
      markAllRead: (folderId) => live.markAllRead(folderId),
    },
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
  router.handle('little:navigate', ({ input }, { sender }) => {
    littleWindows.get(sender.webContentsId)?.navigate(input);
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
  router.handle('downloads:recent', async () => ({
    items: (await downloadService?.recent()) ?? [],
  }));
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
    applyLittleShortcut,
    clearProfileData: async (partition) => {
      const s = session.fromPartition(partition);
      await s.clearStorageData();
      await s.clearCache();
    },
    revealData: () => void shell.openPath(app.getPath('userData')),
    ai: {
      status: () => ({ hasKey: keyStore.has(), canStore: keyStore.canStore, model: TIDY_MODEL }),
      setKey: (input) => {
        const key = cleanApiKey(input);
        if (!key)
          return { ok: false, error: 'That doesn’t look like an Anthropic API key (sk-ant-…)' };
        try {
          keyStore.set(key);
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        refreshSidebars(); // Tidy appears
        return { ok: true, error: null };
      },
      clearKey: () => {
        keyStore.clear();
        refreshSidebars();
      },
    },
  });
  runTidy = async (controller) => {
    try {
      const made = await tidy.tidy(controller.tabs.space);
      toast(
        controller,
        made > 0 ? `Tidied into ${made} folder${made === 1 ? '' : 's'}` : 'Nothing to group',
      );
    } catch (error) {
      toast(controller, error instanceof Error ? error.message : String(error));
    }
  };
  router.handle('sidebar:tidy', async (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller) await runTidy?.(controller);
  });
  router.handle('sidebar:untidy', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller) tidy.untidy(controller.tabs.space);
  });
  registerSiteControlsHandlers(router, windowManager, {
    siteSettings: persistence.siteSettings,
    extensions: extensionHost,
    boosts,
    toast,
    resetZoom: (controller) => zoom(controller, 'reset'),
    saveCapture: (png) => media.saveCapture(png),
    captures,
  });
  registerEaselHandlers(router, windowManager, { easels: persistence.easels, captures, toast });
  const notesRepo = persistence.notes;
  const settingsRepo = persistence.settings;
  const floating = new FloatingNotes({
    internalPreload: join(import.meta.dirname, '../preload/internal.cjs'),
    loadInternal,
    registerInternal: (id) => senders.add(id, 'internal'),
    unregisterInternal: (id) => senders.remove(id),
    persist: (open) => settingsRepo.set('notes.floating', open),
    onClosed: (id) => {
      const inTab = windowManager
        .all()
        .some((c) => c.tabs.snapshot().tabs.some((t) => t.url === noteUrl(id)));
      if (!inTab) notesRepo.deleteIfBlank(id);
    },
  });
  floatingNotes = floating;
  registerNotesHandlers(router, windowManager, { notes: notesRepo, floating });
  registerProfileHandlers(router, windowManager, { runCommand });
  registerLibraryHandlers(router, windowManager, { downloads, media, boosts, toast });
  registerBoostHandlers(router, windowManager, { boosts, toast });
  router.handle('tabs:copyUrl', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller && copyActiveUrl(controller)) toast(controller, 'Copied link');
  });
  router.handle('tabs:devtools', ({ tabId }, { sender }) => {
    const contents = windowManager.forSender(sender.webContentsId)?.tabs.get(tabId)
      ?.view.webContents;
    if (!contents) return;
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: 'detach' });
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
    newLittleWindow: openEmptyLittle,
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
  openLittle = (url: string | null) => {
    const little = new LittleWindow(url, {
      resolve: (input) => classifyInput(input)?.url ?? null,
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

  // Notes left empty last time go (unless a tab or floating note still shows them); floating
  // notes come back where they were.
  const savedFloating = settingsRepo.get('notes.floating');
  const shown = new Set(savedFloating.map((n) => n.id));
  for (const item of store.all()) {
    if (item.url?.startsWith('orbit://note/')) shown.add(item.url.slice('orbit://note/'.length));
  }
  notesRepo.pruneBlank(shown);
  floating.restore(savedFloating, (id) => notesRepo.get(id) !== null);
  applyLittleShortcut(persistence?.settings.get('little.globalShortcut') ?? false);
});
