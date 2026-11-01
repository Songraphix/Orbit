import { BrowserWindow, WebContentsView } from 'electron';
import type { RendererEntry } from '@shared/constants';
import { guardWebContents } from '../tabs/web-guards';

/** The strip at the top of a Little Orbit window: traffic lights, address, "Open in Orbit". */
export const LITTLE_BAR_HEIGHT = 38;

/** Only real web pages arrive from other apps. Pure. */
export function acceptExternalUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export type LittleDeps = {
  preloadPath: string;
  loadRenderer: (win: BrowserWindow, entry: RendererEntry, query?: string) => void;
  register: (webContentsId: number) => void;
  unregister: (webContentsId: number) => void;
  /** "Open in Orbit": hand the URL to the main window as a new tab. */
  openInMain: (url: string) => void;
  /** Sends the page's url/title to the bar. */
  send: (bar: Electron.WebContents, state: { url: string; title: string }) => void;
};

/**
 * Little Orbit (F-24): links clicked in other apps open in a small floating window instead of
 * the main one. Its bar (the shell renderer in "little" mode) shows the page and an "Open in
 * Orbit" button that moves the page into the main window.
 */
export class LittleWindow {
  readonly win: BrowserWindow;
  readonly page: WebContentsView;

  constructor(
    url: string,
    private readonly deps: LittleDeps,
  ) {
    this.win = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 360,
      minHeight: 300,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
      vibrancy: 'sidebar',
      backgroundColor: '#00000000',
      show: false,
      webPreferences: {
        preload: deps.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const bar = this.win.webContents;
    const barId = bar.id;
    deps.register(barId);
    bar.once('destroyed', () => deps.unregister(barId));
    bar.on('will-navigate', (event) => event.preventDefault());
    bar.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.page = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.page.setBorderRadius(8);
    this.win.contentView.addChildView(this.page);
    // Links that open new tabs from a Little Orbit page go to the main window.
    guardWebContents(this.page.webContents, (link) => deps.openInMain(link));
    this.page.webContents.on('page-title-updated', () => this.sendState());
    this.page.webContents.on('did-navigate', () => this.sendState());
    this.page.webContents.on('did-navigate-in-page', () => this.sendState());

    this.fit();
    this.win.on('resize', () => this.fit());
    this.win.on('closed', () => {
      if (!this.page.webContents.isDestroyed()) this.page.webContents.close();
    });
    this.win.once('ready-to-show', () => this.win.show());
    deps.loadRenderer(this.win, 'shell', 'mode=little');
    void this.page.webContents.loadURL(url).catch(() => undefined);
  }

  get url(): string {
    return this.page.webContents.getURL();
  }

  get title(): string {
    return this.page.webContents.getTitle();
  }

  /** Moves the page into the main window and closes this one. */
  promote(): void {
    const url = this.url;
    if (url) this.deps.openInMain(url);
    this.win.close();
  }

  private fit(): void {
    const [width = 0, height = 0] = this.win.getContentSize();
    const inset = 6;
    this.page.setBounds({
      x: inset,
      y: LITTLE_BAR_HEIGHT,
      width: Math.max(0, width - inset * 2),
      height: Math.max(0, height - LITTLE_BAR_HEIGHT - inset),
    });
  }

  private sendState(): void {
    if (this.win.isDestroyed()) return;
    this.deps.send(this.win.webContents, { url: this.url, title: this.title });
  }
}
