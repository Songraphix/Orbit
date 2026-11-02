import type { BrowserWindow, Event, Input } from 'electron';
import type { Layout } from '@shared/types/layout';
import type { TabController } from '../tabs/tab-controller';
import type { TabManager } from '../tabs/tab-manager';
import type { OverlayController } from '../windows/overlay';
import { computePeek, contentArea, PEEK } from '../windows/layout';

export type PeekDeps = {
  win: BrowserWindow;
  tabs: TabManager;
  overlay: OverlayController;
  getLayout: () => Layout;
};

/**
 * Peek (F-23): a floating preview of a link from a pinned tab or favorite. The page is a normal
 * sandboxed web view placed above the overlay; the overlay draws the frame around it (header
 * with "Open as Tab" and close, dimmed backdrop that closes it when clicked). "Open as Tab"
 * hands the same page to the TabManager, so nothing reloads.
 */
export class PeekController {
  private tab: TabController | null = null;

  constructor(private readonly deps: PeekDeps) {}

  get isOpen(): boolean {
    return this.tab !== null;
  }

  get url(): string | null {
    return this.tab?.state.url ?? null;
  }

  open(fromTabId: string, url: string): void {
    if (this.tab) {
      this.tab.load(url);
      this.tab.view.webContents.focus();
      return;
    }
    const tab = this.deps.tabs.createDetached(url, fromTabId, () => this.sync());
    this.tab = tab;
    tab.view.webContents.on('before-input-event', this.onInput);
    this.deps.win.contentView.addChildView(tab.view); // top-most, above the overlay
    tab.view.setBorderRadius(PEEK.radius);
    this.growIn(tab);
    tab.view.setVisible(true);
    tab.view.webContents.focus();
    this.sync();
  }

  /** The page pops out smoothly (Arc-like): it grows from a little smaller into place, in
   *  step with the frame the overlay draws (orbit-peek-in, the same length). */
  private growIn(tab: TabController): void {
    const target = this.geometry().webView;
    const quiet = process.env['ORBIT_QUIET'] === '1';
    const steps = quiet ? 1 : 12;
    let step = 0;
    const place = () => {
      if (this.tab !== tab || tab.view.webContents.isDestroyed()) return;
      step++;
      const t = step / steps;
      const scale = 0.94 + 0.06 * (1 - (1 - t) ** 3); // ease-out
      const width = Math.round(target.width * scale);
      const height = Math.round(target.height * scale);
      tab.view.setBounds({
        x: target.x + Math.round((target.width - width) / 2),
        y: target.y + Math.round((target.height - height) / 2),
        width,
        height,
      });
      if (step < steps) setTimeout(place, 16);
      else this.fit();
    };
    place();
  }

  /** Back, forward or reload inside the preview. */
  navigate(action: 'back' | 'forward' | 'reload'): void {
    const contents = this.tab?.view.webContents;
    if (!contents || contents.isDestroyed()) return;
    const history = contents.navigationHistory;
    if (action === 'reload') contents.reload();
    else if (action === 'back' && history.canGoBack()) history.goBack();
    else if (action === 'forward' && history.canGoForward()) history.goForward();
  }

  /** The split button: beside the page it came from, in split view. */
  split(): void {
    const tab = this.release();
    if (!tab) return;
    this.deps.tabs.adoptInSplit(tab);
    this.deps.overlay.setPeek(null);
  }

  close(): void {
    const tab = this.release();
    if (!tab) return;
    tab.destroy();
    this.deps.overlay.setPeek(null);
  }

  /** "Open as Tab". */
  promote(): void {
    const tab = this.release();
    if (!tab) return;
    this.deps.tabs.adopt(tab);
    this.deps.overlay.setPeek(null);
  }

  /** Re-place the page after a layout change. */
  fit(): void {
    const tab = this.tab;
    if (!tab) return;
    tab.view.setBounds(this.geometry().webView);
    tab.view.setBorderRadius(PEEK.radius);
    this.sync();
  }

  private geometry() {
    return computePeek(contentArea(this.deps.getLayout()));
  }

  /** Detaches the page from the Peek frame and returns it. */
  private release(): TabController | null {
    const tab = this.tab;
    if (!tab) return null;
    this.tab = null;
    const contents = tab.view.webContents;
    if (!contents.isDestroyed()) contents.off('before-input-event', this.onInput);
    if (!this.deps.win.isDestroyed()) this.deps.win.contentView.removeChildView(tab.view);
    return tab;
  }

  /** Esc inside the previewed page closes the preview. */
  private readonly onInput = (event: Event, input: Input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape') return;
    if (input.meta || input.control || input.alt || input.shift) return;
    event.preventDefault();
    this.close();
  };

  private sync(): void {
    const tab = this.tab;
    if (!tab || this.deps.win.isDestroyed()) return;
    const { frame } = this.geometry();
    const { url, title, favicon, isLoading, canGoBack, canGoForward } = tab.state;
    this.deps.overlay.setPeek({
      url,
      title,
      favicon,
      isLoading,
      canGoBack,
      canGoForward,
      frame,
      headerHeight: PEEK.headerHeight,
      radius: PEEK.radius,
    });
  }
}
