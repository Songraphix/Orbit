import type { WebContentsView } from 'electron';
import type { AppPanelState } from '@shared/apps';
import type { Layout } from '@shared/types/layout';
import type { TabController } from '../tabs/tab-controller';

/** The panel's header (drawn by the shell): title and buttons, above the app. */
export const APP_PANEL_HEADER = 40;
/** The app's page sits this far inside the panel's island. */
const APP_INSET = 6;

export type AppPanelDeps = {
  getLayout: () => Layout;
  /** Where apps open (Settings → Appearance): beside the rail (UI 3), or the dock on the right
   *  that the Notes panel uses (then only one of them shows at a time). */
  side?: () => 'left' | 'right';
  /** Makes room for the app (the page narrows), or gives it back. */
  setDockOpen: (open: boolean) => void;
  /** A page outside the sidebar, in the favourite's profile (TabManager.createDetached). */
  createPage: (url: string, itemId: string, onChange: () => void) => TabController;
  attach: (view: WebContentsView) => void;
  detach: (view: WebContentsView) => void;
  /** The page becomes an ordinary tab (Open as Tab). */
  adopt: (page: TabController) => void;
  /** Tells the shell (its header). */
  push: (state: AppPanelState | null) => void;
  /** The Notes panel steps aside. */
  closeNotes: () => void;
};

/**
 * App Hub docked panels (brief §3, M5; owner's choice): a favourite set to "Open in Panel" runs
 * beside the page in the dock on the right, like Vivaldi's and Opera's web panels — a real,
 * sandboxed page in the favourite's profile (not an iframe, so sites that refuse framing still
 * work). Closing hides it, so reopening the same app is instant and keeps its place.
 */
export class AppPanelController {
  private page: TabController | null = null;
  private itemId: string | null = null;
  private shown = false;
  /** Hidden while the dock's edge is dragged (native views swallow the pointer). */
  private suspended = false;

  constructor(private readonly deps: AppPanelDeps) {}

  get isOpen(): boolean {
    return this.shown;
  }

  get openItemId(): string | null {
    return this.shown ? this.itemId : null;
  }

  /** Opens a favourite's app in the panel (the same one again: as it was). */
  open(itemId: string, url: string): void {
    if (this.itemId !== itemId || !this.page) {
      this.dispose();
      this.itemId = itemId;
      this.page = this.deps.createPage(url, itemId, () => {
        this.fit(); // a page that couldn't load hides, so the shell's card shows
        this.push();
      });
      this.deps.attach(this.page.view);
    }
    if (this.side === 'right') this.deps.closeNotes();
    this.shown = true;
    this.deps.setDockOpen(true);
    this.fit();
    this.page.view.webContents.focus();
    this.push();
  }

  /** Hides the panel (the app stays loaded for next time). */
  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.page?.view.setVisible(false);
    this.deps.setDockOpen(false);
    this.push();
  }

  toggle(itemId: string, url: string): void {
    if (this.shown && this.itemId === itemId) this.close();
    else this.open(itemId, url);
  }

  /** Back, forward or reload inside the panel. */
  navigate(action: 'back' | 'forward' | 'reload'): void {
    const contents = this.page?.view.webContents;
    if (!contents || contents.isDestroyed()) return;
    if (action === 'reload')
      this.page?.reload(); // also retries a page that couldn't load
    else if (action === 'back' && contents.navigationHistory.canGoBack())
      contents.navigationHistory.goBack();
    else if (action === 'forward' && contents.navigationHistory.canGoForward())
      contents.navigationHistory.goForward();
  }

  /** "Open as Tab": the page moves into the sidebar as it is; the panel closes. */
  openAsTab(): void {
    const page = this.page;
    if (!page) return;
    this.page = null;
    this.itemId = null;
    this.shown = false;
    this.deps.setDockOpen(false);
    this.deps.adopt(page);
    this.push();
  }

  /** The dock's edge is being dragged (true) or was let go (false). */
  suspend(on: boolean): void {
    this.suspended = on;
    if (on) this.page?.view.setVisible(false);
    else this.fit();
  }

  /** Which side it opens on now. */
  get side(): 'left' | 'right' {
    return this.deps.side?.() ?? 'right';
  }

  /** Re-place it after a layout change (the header sits above the app). */
  fit(): void {
    const view = this.page?.view;
    if (!view || !this.shown) return;
    const layout = this.deps.getLayout();
    const dock = this.side === 'left' ? layout.appDock : layout.notes;
    if (!dock || this.suspended || this.page?.state.loadError) {
      view.setVisible(false); // a page went fullscreen
      return;
    }
    // A card inside the panel's glass island, below its header (UI 3).
    view.setBounds({
      x: dock.x + APP_INSET,
      y: dock.y + APP_PANEL_HEADER,
      width: Math.max(0, dock.width - APP_INSET * 2),
      height: Math.max(0, dock.height - APP_PANEL_HEADER - APP_INSET),
    });
    view.setBorderRadius(14);
    view.setVisible(true);
  }

  state(): AppPanelState | null {
    if (!this.shown || !this.page || !this.itemId) return null;
    const { title, url, favicon, isLoading, canGoBack, loadError } = this.page.state;
    return {
      itemId: this.itemId,
      title: title || url,
      url,
      favicon,
      isLoading,
      canGoBack,
      loadError: loadError?.code ?? null,
    };
  }

  destroy(): void {
    this.dispose();
    this.shown = false;
  }

  private push(): void {
    this.deps.push(this.state());
  }

  private dispose(): void {
    const page = this.page;
    this.page = null;
    this.itemId = null;
    if (!page) return;
    this.deps.detach(page.view);
    page.destroy();
  }
}
