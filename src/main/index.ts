import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { WebContentsView } from 'electron';
import { APP_NAME, isInternalPage } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';
import { chromeUserAgent } from './app/user-agent';
import { Broadcaster } from './ipc/broadcaster';
import { registerAppHandlers } from './ipc/handlers/app';
import { registerLayoutHandlers } from './ipc/handlers/layout';
import { registerNewTabHandlers } from './ipc/handlers/newtab';
import { navigateTab, registerTabHandlers } from './ipc/handlers/tabs';
import { WallpaperService } from './newtab/wallpaper-service';
import { installAppMenu } from './menus/app-menu';
import { IpcRouter } from './ipc/router';
import { SenderRegistry } from './ipc/sender';
import { openPersistence } from './persistence';
import type { Persistence } from './persistence';
import { WindowManager } from './windows/window-manager';

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
let windows: WindowManager | null = null;

function loadRenderer(win: BrowserWindow, entry: RendererEntry): void {
  if (devServer) void win.loadURL(`${devServer}/${entry}/index.html`);
  else void win.loadFile(join(rendererDir, entry, 'index.html'));
}

/** orbit://<page> → the internal renderer with `#/<page>`. Unknown pages show "not found". */
function loadInternal(view: WebContentsView, url: string): void {
  const page = new URL(url).hostname;
  const hash = `/${isInternalPage(page) ? page : 'not-found'}`;
  if (devServer) void view.webContents.loadURL(`${devServer}/internal/index.html#${hash}`);
  else void view.webContents.loadFile(join(rendererDir, 'internal', 'index.html'), { hash });
}

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
  persistence?.close();
  persistence = null;
});

void app.whenReady().then(() => {
  persistence = openPersistence(app.getPath('userData'));
  windows = new WindowManager({
    settings: persistence.settings,
    tabsRepo: persistence.tabs,
    senders,
    broadcaster,
    preloadPath: join(import.meta.dirname, '../preload/shell.cjs'),
    internalPreloadPath: join(import.meta.dirname, '../preload/internal.cjs'),
    loadRenderer,
    loadInternal,
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
  router.assertComplete();

  installAppMenu({
    toggleSidebar: () => windowManager.focused()?.layout.toggleSidebar(),
    newTab: () => windowManager.focused()?.tabs.create(),
    closeTab: () => {
      const tabs = windowManager.focused()?.tabs;
      const active = tabs?.active;
      if (tabs && active) tabs.close(active.id);
    },
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
  windowManager.createMainWindow();
});
