import type { WebContentsView } from 'electron';
import type { AliveApp, AppPanelState } from '@shared/apps';
import type { Layout, Rect } from '@shared/types/layout';
import type { TabController } from '../tabs/tab-controller';

/** The panel's header (drawn by the shell, or the overlay when it floats), above the app. */
export const APP_PANEL_HEADER = 40;
/** The app's page sits this far inside the panel's island. */
const APP_INSET = 6;
/** How many apps stay running at once (the least recently used quiet one goes first). */
export const MAX_ALIVE = 6;

export type AppPanelDeps = {
  getLayout: () => Layout;
  /** Where apps open (Settings → Appearance): beside the rail (UI 3), or the dock on the right
   *  that the Notes panel uses (then only one of them shows at a time). */
  side?: () => 'left' | 'right';
  /** Pinned: it sits beside the page, which makes room; unpinned: it floats over the page and
   *  tucks away when you click back on the page (Opera's sidebar; owner request). */
  pinned?: () => boolean;
  setPinned?: (pinned: boolean) => void;
  /** Makes room for the app (the page narrows), or gives it back; `float`: over the page. */
  setDockOpen: (open: boolean, float?: boolean) => void;
  /** A page outside the sidebar, in the favourite's profile (TabManager.createDetached). */
  createPage: (url: string, itemId: string, onChange: () => void) => TabController;
  attach: (view: WebContentsView) => void;
  detach: (view: WebContentsView) => void;
  /** Floating: the page goes above everything (the overlay draws its frame); back below. */
  raise?: (view: WebContentsView) => void;
  lower?: (view: WebContentsView) => void;
  /** The overlay shows (rect) or hides (null) the floating panel's frame and backdrop. */
  floatFrame?: (rect: Rect | null) => void;
  /** The page becomes an ordinary tab (Open as Tab). */
  adopt: (page: TabController) => void;
  /** Tells the shell (and the overlay) the panel's state. */
  push: (state: AppPanelState | null) => void;
  /** Which apps are running (the rail marks them, and those playing sound). */
  pushAlive?: (alive: AliveApp[]) => void;
  /** The Notes panel steps aside. */
  closeNotes: () => void;
};

/**
 * Sidebar apps (brief M5; owner request, like Opera's sidebar): a favourite set to open beside
 * the page runs in its own real, sandboxed page in the favourite's profile. Each app you open
 * **keeps running** — switch to another or tuck the panel away and music keeps playing, a chat
 * keeps its place — up to MAX_ALIVE at once. Pinned, the panel sits beside the page; unpinned,
 * it floats over it and a click back on the page tucks it away.
 */
export class AppPanelController {
  private readonly pages = new Map<string, TabController>();
  /** Most recently used last. */
  private order: string[] = [];
  private itemId: string | null = null;
  private shown = false;
  /** The way it's showing now (it can change while it's open). */
  private floating = false;
  /** Hidden while the dock's edge is dragged (native views swallow the pointer). */
  private suspended = false;

  constructor(private readonly deps: AppPanelDeps) {}

  get isOpen(): boolean {
    return this.shown;
  }

  get openItemId(): string | null {
    return this.shown ? this.itemId : null;
  }

  /** Which side it opens on now. */
  get side(): 'left' | 'right' {
    return this.deps.side?.() ?? 'right';
  }

  /** Pinned beside the page (always so on the right-hand dock). */
  get pinned(): boolean {
    return this.side === 'right' || (this.deps.pinned?.() ?? true);
  }

  /** The app's page, if it's running. */
  private get page(): TabController | null {
    return this.itemId ? (this.pages.get(this.itemId) ?? null) : null;
  }

  /** Opens a favourite's app in the panel: the running one as it was, or a new one. */
  open(itemId: string, url: string): void {
    const previous = this.page;
    let page = this.pages.get(itemId);
    if (!page) {
      const created = this.deps.createPage(url, itemId, () => {
        if (this.itemId === itemId) {
          this.fit(); // a page that couldn't load hides, so the card shows
          this.push();
        }
        this.pushAlive();
      });
      created.view.webContents.on('audio-state-changed', () => this.pushAlive());
      created.view.setVisible(false);
      this.pages.set(itemId, created);
      this.deps.attach(created.view);
      page = created;
    }
    // The one that was showing keeps running out of sight.
    if (previous && previous !== page) {
      previous.view.setVisible(false);
      if (this.floating) this.deps.lower?.(previous.view);
    }
    this.itemId = itemId;
    this.touch(itemId);
    this.evict();
    if (this.side === 'right') this.deps.closeNotes();
    this.show(previous !== page);
    page.view.webContents.focus();
    this.push();
    this.pushAlive();
  }

  /** Tucks the panel away; every app keeps running (music keeps playing). */
  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.page?.view.setVisible(false);
    this.leaveFloat();
    this.deps.setDockOpen(false);
    this.push();
  }

  toggle(itemId: string, url: string): void {
    if (this.shown && this.itemId === itemId) this.close();
    else this.open(itemId, url);
  }

  /** Pin it beside the page, or let it float over the page (kept as your choice). */
  setPinned(pinned: boolean): void {
    if (this.side === 'right') return;
    this.deps.setPinned?.(pinned);
    if (this.shown) {
      if (pinned) this.leaveFloat();
      this.show(false);
    }
    this.push();
  }

  /** Stops an app (its page closes; the next open starts it afresh). */
  quit(itemId: string): void {
    const page = this.pages.get(itemId);
    if (!page) return;
    if (this.itemId === itemId) {
      this.close();
      this.itemId = null;
    }
    this.pages.delete(itemId);
    this.order = this.order.filter((id) => id !== itemId);
    this.deps.detach(page.view);
    page.destroy();
    this.pushAlive();
  }

  isAlive(itemId: string): boolean {
    return this.pages.has(itemId);
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
    const itemId = this.itemId;
    if (!page || !itemId) return;
    this.close();
    this.pages.delete(itemId);
    this.order = this.order.filter((id) => id !== itemId);
    this.itemId = null;
    this.deps.detach(page.view);
    this.deps.adopt(page);
    this.push();
    this.pushAlive();
  }

  /** The dock's edge is being dragged (true) or was let go (false). */
  suspend(on: boolean): void {
    this.suspended = on;
    if (on) this.page?.view.setVisible(false);
    else this.fit();
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
    if (this.floating) this.deps.floatFrame?.(dock);
  }

  state(): AppPanelState | null {
    const page = this.page;
    if (!this.shown || !page || !this.itemId) return null;
    const { title, url, favicon, isLoading, canGoBack, loadError } = page.state;
    return {
      itemId: this.itemId,
      title: title || url,
      url,
      favicon,
      isLoading,
      canGoBack,
      loadError: loadError?.code ?? null,
      pinned: this.pinned,
      canPin: this.side === 'left',
    };
  }

  /** Every running app, and whether it's playing sound. */
  alive(): AliveApp[] {
    return [...this.pages].map(([itemId, page]) => ({
      itemId,
      audible: !page.view.webContents.isDestroyed() && page.view.webContents.isCurrentlyAudible(),
    }));
  }

  destroy(): void {
    for (const id of [...this.pages.keys()]) this.quit(id);
    this.shown = false;
  }

  /** Shows the current app the way it's set to: beside the page, or floating over it. */
  private show(newPage: boolean): void {
    const page = this.page;
    if (!page) return;
    this.shown = true;
    const float = !this.pinned;
    if (float && (!this.floating || newPage)) this.deps.raise?.(page.view);
    if (!float && this.floating) this.deps.lower?.(page.view);
    this.floating = float;
    if (!float) this.deps.floatFrame?.(null);
    this.deps.setDockOpen(true, float);
    this.fit();
  }

  private leaveFloat(): void {
    if (!this.floating) return;
    this.floating = false;
    this.deps.floatFrame?.(null);
    const page = this.page;
    if (page) this.deps.lower?.(page.view);
  }

  private touch(itemId: string): void {
    this.order = [...this.order.filter((id) => id !== itemId), itemId];
  }

  /** Too many running: the least recently used quiet one stops (never the one on screen). */
  private evict(): void {
    while (this.pages.size > MAX_ALIVE) {
      const quiet = this.order.find((id) => {
        if (id === this.itemId) return false;
        const contents = this.pages.get(id)?.view.webContents;
        return !contents || contents.isDestroyed() || !contents.isCurrentlyAudible();
      });
      const victim = quiet ?? this.order.find((id) => id !== this.itemId);
      if (!victim) return;
      this.quit(victim);
    }
  }

  private push(): void {
    this.deps.push(this.state());
  }

  private pushAlive(): void {
    this.deps.pushAlive?.(this.alive());
  }
}
