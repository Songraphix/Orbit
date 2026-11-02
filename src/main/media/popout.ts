import { BaseWindow, screen, WebContentsView } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import type { PopoutAction, PopoutView } from '@shared/types/media';
import type { Rect } from '@shared/types/layout';
import type { TabManager } from '../tabs/tab-manager';
import {
  DROP_VIDEO,
  LIFT_CSS,
  LIFT_VIDEO,
  PAUSE_VIDEO,
  POPOUT,
  popoutBounds,
  TOGGLE_VIDEO,
} from './popout-model';

export type VideoPopoutDeps = {
  tabs: TabManager;
  /** The browser window the video's tab belongs to ("back to video" brings it forward). */
  main: BrowserWindow;
  internalPreload: string;
  loadInternal: (target: { webContents: WebContents }, url: string) => void;
  registerInternal: (webContentsId: number) => void;
  unregisterInternal: (webContentsId: number) => void;
  send: (contents: WebContents, view: PopoutView) => void;
  /** Popped out or back: the sidebar's mini player follows. */
  onChange: () => void;
};

type Open = {
  tabId: string;
  page: WebContentsView;
  win: BaseWindow;
  controls: WebContentsView;
  css: string | null;
  hoverTimer: ReturnType<typeof setInterval>;
  detach: () => void;
};

/**
 * The video pop-out (owner request, like Arc): switch away from a tab playing a video and the
 * video keeps playing in a small floating window — rounded, above other windows, with
 * minimize, back to the video and close. The tab's own page moves into that window (nothing
 * reloads) with its video lifted to fill it; going back to the tab brings it home.
 */
export class VideoPopout {
  private open: Open | null = null;
  private opening: string | null = null;
  private hover = false;
  private playing = true;
  /** Where the owner last put it (this session). */
  private lastBounds: Rect | null = null;

  constructor(private readonly deps: VideoPopoutDeps) {}

  get tabId(): string | null {
    return this.open?.tabId ?? null;
  }

  /** The pop-out's controls page is this webContents. */
  isControls(webContentsId: number): boolean {
    const controls = this.open?.controls.webContents;
    return !!controls && !controls.isDestroyed() && controls.id === webContentsId;
  }

  view(): PopoutView | null {
    const open = this.open;
    if (!open) return null;
    const tab = this.deps.tabs.get(open.tabId);
    return { title: tab?.state.title ?? '', playing: this.playing, hover: this.hover };
  }

  /**
   * Pops out the playing video of tab `tabId` (not on screen). `auto`: from switching tabs —
   * only a video with sound (not a muted preview). Resolves false if there's nothing to pop.
   */
  async popOut(tabId: string, { auto }: { auto: boolean }): Promise<boolean> {
    if (this.open?.tabId === tabId || this.opening) return false;
    const tab = this.deps.tabs.get(tabId);
    if (!tab || tab.state.kind !== 'web' || this.deps.tabs.isOnScreen(tabId)) return false;
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) return false;
    this.opening = tabId;
    try {
      const size = (await contents.executeJavaScript(LIFT_VIDEO(auto), true).catch(() => null)) as {
        width: number;
        height: number;
      } | null;
      if (!size) return false;
      const css = await contents.insertCSS(LIFT_CSS).catch(() => null);
      // Back on the tab meanwhile (or it went): leave the video where it was.
      if (this.deps.tabs.isOnScreen(tabId) || contents.isDestroyed()) {
        this.restore(contents, css, false);
        return false;
      }
      if (this.open) this.close(); // one pop-out at a time
      const page = this.deps.tabs.lend(tabId);
      if (!page) {
        this.restore(contents, css, false);
        return false;
      }
      this.show(tabId, page, css, size.width / size.height);
      return true;
    } finally {
      this.opening = null;
    }
  }

  /** The tab is about to show in the browser window: its page goes home. */
  reclaim(tabId: string): void {
    if (this.open?.tabId === tabId) this.release(false);
  }

  act(action: PopoutAction): void {
    const open = this.open;
    if (!open) return;
    if (action === 'minimize') open.win.minimize();
    else if (action === 'close') this.close();
    else if (action === 'back') {
      const { main } = this.deps;
      if (!main.isDestroyed()) {
        if (main.isMinimized()) main.restore();
        main.focus();
      }
      this.deps.tabs.activate(open.tabId); // takes the page back on the way
    } else {
      void open.page.webContents
        .executeJavaScript(TOGGLE_VIDEO, true)
        .then((playing: boolean) => this.setPlaying(playing))
        .catch(() => undefined);
    }
  }

  /** Closes the pop-out: the video pauses and goes back to its tab. */
  close(): void {
    this.release(true);
  }

  private show(tabId: string, page: WebContentsView, css: string | null, aspect: number): void {
    const { main } = this.deps;
    const area = screen.getDisplayMatching(
      main.isDestroyed() ? { x: 0, y: 0, width: 1, height: 1 } : main.getBounds(),
    ).workArea;
    const bounds = this.lastBounds ?? popoutBounds(area, aspect);
    const win = new BaseWindow({
      ...bounds,
      frame: false,
      transparent: true,
      hasShadow: true,
      resizable: true,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      minWidth: POPOUT.minWidth,
      minHeight: Math.round(POPOUT.minWidth / 2),
      show: false,
      title: 'Video',
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (Number.isFinite(aspect) && aspect > 0) win.setAspectRatio(aspect);

    const controls = new WebContentsView({
      webPreferences: {
        preload: this.deps.internalPreload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    controls.setBackgroundColor('#00000000');
    const controlsContents = controls.webContents;
    const controlsId = controlsContents.id;
    this.deps.registerInternal(controlsId);
    controlsContents.once('destroyed', () => this.deps.unregisterInternal(controlsId));
    controlsContents.on('will-navigate', (event) => event.preventDefault());
    controlsContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    page.setBorderRadius(POPOUT.radius);
    controls.setBorderRadius(POPOUT.radius);
    win.contentView.addChildView(page);
    win.contentView.addChildView(controls);
    page.setVisible(true);
    const fit = () => {
      if (win.isDestroyed()) return;
      const [width = 0, height = 0] = win.getContentSize();
      page.setBounds({ x: 0, y: 0, width, height });
      controls.setBounds({ x: 0, y: 0, width, height });
    };
    fit();
    win.on('resize', fit);
    const remember = () => {
      if (!win.isDestroyed()) this.lastBounds = win.getBounds();
    };
    win.on('moved', remember);
    win.on('resized', remember);
    win.on('closed', () => {
      if (this.open?.win === win) this.release(false);
    });

    // The page's own play/pause (its controls, keyboard) shows on the button too.
    const contents = page.webContents;
    const onPlay = () => this.setPlaying(true);
    const onPause = () => this.setPlaying(false);
    const onGone = () => {
      if (this.open?.tabId === tabId) this.release(false);
    };
    contents.on('media-started-playing', onPlay);
    contents.on('media-paused', onPause);
    contents.once('destroyed', onGone);
    const detach = () => {
      if (contents.isDestroyed()) return;
      contents.off('media-started-playing', onPlay);
      contents.off('media-paused', onPause);
      contents.off('destroyed', onGone);
    };

    // The buttons show while the pointer is over it (a window you can drag anywhere doesn't
    // get hover events, so main watches the pointer).
    this.hover = false;
    this.playing = true;
    const hoverTimer = setInterval(() => {
      if (win.isDestroyed() || win.isMinimized()) return;
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      if (inside !== this.hover) {
        this.hover = inside;
        this.send();
      }
    }, 120);

    this.open = { tabId, page, win, controls, css, hoverTimer, detach };
    this.deps.loadInternal(controls, 'orbit://popout');
    // It mustn't take focus from the window you just switched tabs in.
    win.showInactive();
    this.deps.onChange();
  }

  /** Takes the page out of the pop-out, back to its tab (`pause`: the video stops too). */
  private release(pause: boolean): void {
    const open = this.open;
    if (!open) return;
    this.open = null;
    clearInterval(open.hoverTimer);
    open.detach();
    const contents = open.page.webContents;
    if (!open.win.isDestroyed()) {
      open.win.contentView.removeChildView(open.page);
      open.win.contentView.removeChildView(open.controls);
    }
    if (!contents.isDestroyed()) this.restore(contents, open.css, pause);
    if (!open.controls.webContents.isDestroyed()) open.controls.webContents.close();
    if (!open.win.isDestroyed()) open.win.destroy();
    this.deps.tabs.takeBack(open.tabId);
    this.deps.onChange();
  }

  /** The video back where the site had it (paused, if asked). */
  private restore(contents: WebContents, css: string | null, pause: boolean): void {
    if (pause) void contents.executeJavaScript(PAUSE_VIDEO, true).catch(() => undefined);
    if (css) void contents.removeInsertedCSS(css).catch(() => undefined);
    void contents.executeJavaScript(DROP_VIDEO, true).catch(() => undefined);
  }

  private setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.send();
  }

  private send(): void {
    const view = this.view();
    const contents = this.open?.controls.webContents;
    if (view && contents && !contents.isDestroyed()) this.deps.send(contents, view);
  }
}
