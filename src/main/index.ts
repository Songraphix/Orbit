import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';
import { Broadcaster } from './ipc/broadcaster';
import { registerAppHandlers } from './ipc/handlers/app';
import { IpcRouter } from './ipc/router';
import { SenderRegistry } from './ipc/sender';
import { openPersistence } from './persistence';
import type { Persistence } from './persistence';

app.setName(APP_NAME);

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
const router = new IpcRouter(ipcMain, senders);
registerAppHandlers(router);
router.assertComplete();

function loadRenderer(win: BrowserWindow, entry: RendererEntry): void {
  if (devServer) void win.loadURL(`${devServer}/${entry}/index.html`);
  else void win.loadFile(join(rendererDir, entry, 'index.html'));
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/shell.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const contents = win.webContents;
  senders.add(contents.id);
  broadcaster.add(contents);
  contents.once('destroyed', () => {
    senders.remove(contents.id);
    broadcaster.remove(contents);
  });

  win.once('ready-to-show', () => win.show());

  // The shell never navigates or opens windows itself (PLAN.md section 4.8).
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  loadRenderer(win, 'shell');
  return win;
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let persistence: Persistence | null = null;

app.on('will-quit', () => {
  persistence?.close();
  persistence = null;
});

void app.whenReady().then(() => {
  persistence = openPersistence(app.getPath('userData'));
  createMainWindow();
});
