import { BrowserWindow, screen } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { RendererEntry } from '@shared/constants';
import type { Broadcaster } from '../ipc/broadcaster';
import type { SenderRegistry } from '../ipc/sender';
import type { SettingsRepository } from '../persistence/repositories/settings';
import { MIN_SIZE, resolveWindowBounds } from './window-state';

/** Where the macOS traffic lights sit, inside the sidebar's top-left corner (F-01). */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 18 } as const;

/** Window position/size writes are debounced; moving a window fires dozens of events. */
const SAVE_DELAY_MS = 500;

export type WindowManagerDeps = {
  settings: SettingsRepository;
  senders: SenderRegistry;
  broadcaster: Broadcaster;
  preloadPath: string;
  loadRenderer: (win: BrowserWindow, entry: RendererEntry) => void;
};

/** Creates and restores Orbit's windows (PLAN.md section 4.3). */
export class WindowManager {
  constructor(private readonly deps: WindowManagerDeps) {}

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
    senders.add(contents.id);
    broadcaster.add(contents);
    contents.once('destroyed', () => {
      senders.remove(contents.id);
      broadcaster.remove(contents);
    });

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
