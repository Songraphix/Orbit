import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';

app.setName(APP_NAME);

// One Orbit at a time; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function rendererUrl(entry: RendererEntry): { url: string } | { file: string } {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServer) return { url: `${devServer}/${entry}/index.html` };
  return { file: join(import.meta.dirname, `../renderer/${entry}/index.html`) };
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

  win.once('ready-to-show', () => win.show());

  // The shell never navigates or opens windows itself (PLAN.md section 4.8).
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const target = rendererUrl('shell');
  if ('url' in target) void win.loadURL(target.url);
  else void win.loadFile(target.file);

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

void app.whenReady().then(() => {
  createMainWindow();
});
