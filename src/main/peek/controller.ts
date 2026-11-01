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
    this.fit();
    tab.view.setVisible(true);
    tab.view.webContents.focus();
    this.sync();
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
    const { url, title, favicon, isLoading } = tab.state;
    this.deps.overlay.setPeek({
      url,
      title,
      favicon,
      isLoading,
      frame,
      headerHeight: PEEK.headerHeight,
      radius: PEEK.radius,
    });
  }
}
