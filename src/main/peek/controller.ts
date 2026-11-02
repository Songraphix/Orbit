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
  /** The tab on screen (a Peek shows only over the tab it came from). */
  activeTabId: () => string | null;
  /** The tab still exists (closed tabs take their Peek with them). */
  exists: (tabId: string) => boolean;
  /** A Peek opened, closed or changed its icon or title: the sidebar's badges follow. */
  onBadgesChange: () => void;
};

/** Why a Peek is hidden for now: something else is in front (the command bar, a prompt…) or
 *  the Library has the page area. */
export type PeekHold = 'overlay' | 'library';

/**
 * Peek (F-23), Arc-style: a link that wanted a new tab pops out as a floating page over the tab
 * it came from. The page is a normal sandboxed web view placed above the overlay, which draws
 * the frame around it (the dimmed page area, the bar, the round buttons beside it).
 *
 * Each tab keeps its own Peek: switch to another tab (the sidebar stays usable) and the Peek
 * waits, with its icon on the source tab's icon; come back and it's there again. "Open as Tab"
 * and "Open in Split View" hand the same page to the TabManager, so nothing reloads.
 */
export class PeekController {
  /** Open Peeks, by the tab they came from. */
  private readonly peeks = new Map<string, TabController>();
  /** The source tab whose Peek is showing. */
  private shownId: string | null = null;
  private readonly holds = new Set<PeekHold>();

  constructor(private readonly deps: PeekDeps) {}

  /** A Peek is showing. */
  get isOpen(): boolean {
    return this.shownId !== null;
  }

  get url(): string | null {
    return this.shown?.state.url ?? null;
  }

  /** How many tabs keep a Peek (showing or waiting). */
  get count(): number {
    return this.peeks.size;
  }

  private get shown(): TabController | null {
    return this.shownId === null ? null : (this.peeks.get(this.shownId) ?? null);
  }

  /** The badge for a tab's waiting (or showing) Peek. */
  badge(tabId: string): { favicon: string | null; title: string } | null {
    const tab = this.peeks.get(tabId);
    if (!tab) return null;
    return { favicon: tab.state.favicon, title: tab.state.title || tab.state.url };
  }

  open(fromTabId: string, url: string): void {
    const existing = this.peeks.get(fromTabId);
    if (existing) {
      existing.load(url);
      this.show(fromTabId);
      return;
    }
    const tab = this.deps.tabs.createDetached(url, fromTabId, () => this.changed(fromTabId));
    tab.view.webContents.on('before-input-event', this.onInput);
    tab.view.setVisible(false);
    this.peeks.set(fromTabId, tab);
    this.show(fromTabId);
    this.deps.onBadgesChange();
  }

  /** Keeps the Peek hidden while something else needs the page area (or lets it back). */
  hold(reason: PeekHold, on: boolean): void {
    if (on === this.holds.has(reason)) return;
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    this.refresh();
  }

  /** Shows the active tab's Peek, if it has one and nothing holds it; hides any other. Also lets
   *  go of Peeks whose tab was closed. Call when the active tab changes. */
  refresh(): void {
    let dropped = false;
    for (const [sourceId, tab] of [...this.peeks]) {
      if (this.deps.exists(sourceId)) continue;
      this.peeks.delete(sourceId);
      if (this.shownId === sourceId) this.hide();
      this.detach(tab);
      tab.destroy();
      dropped = true;
    }
    const active = this.deps.activeTabId();
    const want = active !== null && this.peeks.has(active) && this.holds.size === 0 ? active : null;
    if (want !== this.shownId) {
      if (want === null) this.hide();
      else this.show(want);
    }
    if (dropped) this.deps.onBadgesChange();
  }

  /** Back, forward or reload inside the preview. */
  navigate(action: 'back' | 'forward' | 'reload'): void {
    const contents = this.shown?.view.webContents;
    if (!contents || contents.isDestroyed()) return;
    const history = contents.navigationHistory;
    if (action === 'reload') contents.reload();
    else if (action === 'back' && history.canGoBack()) history.goBack();
    else if (action === 'forward' && history.canGoForward()) history.goForward();
  }

  /** The split button: beside the page it came from, in split view. */
  split(): void {
    const tab = this.release();
    if (tab) this.deps.tabs.adoptInSplit(tab);
  }

  /** Closes the Peek that's showing. */
  close(): void {
    this.release()?.destroy();
  }

  /** Closes every Peek (the window is going). */
  closeAll(): void {
    this.hide();
    for (const tab of this.peeks.values()) {
      this.detach(tab);
      tab.destroy();
    }
    this.peeks.clear();
  }

  /** "Open as Tab". */
  promote(): void {
    const tab = this.release();
    if (tab) this.deps.tabs.adopt(tab);
  }

  /** Re-place the page after a layout change. */
  fit(): void {
    const tab = this.shown;
    if (!tab) return;
    tab.view.setBounds(this.geometry().webView);
    tab.view.setBorderRadius(PEEK.radius);
    this.sync();
  }

  private show(sourceId: string): void {
    const tab = this.peeks.get(sourceId);
    if (!tab || this.deps.win.isDestroyed()) return;
    if (this.shownId !== null && this.shownId !== sourceId) this.hide();
    const opening = this.shownId !== sourceId;
    this.shownId = sourceId;
    if (opening) {
      this.deps.win.contentView.addChildView(tab.view); // top-most, above the overlay
      tab.view.setBorderRadius(PEEK.radius);
      this.growIn(tab);
      tab.view.setVisible(true);
    }
    tab.view.webContents.focus();
    this.sync();
  }

  /** Hides the showing Peek; it waits on its tab. */
  private hide(): void {
    const tab = this.shown;
    this.shownId = null;
    if (tab) this.detach(tab);
    this.deps.overlay.setPeek(null);
  }

  private detach(tab: TabController): void {
    if (tab.view.webContents.isDestroyed() || this.deps.win.isDestroyed()) return;
    tab.view.setVisible(false);
    this.deps.win.contentView.removeChildView(tab.view);
  }

  /** The page pops out smoothly (Arc-like): it grows from a little smaller into place, in
   *  step with the frame the overlay draws (orbit-peek-in, the same length). */
  private growIn(tab: TabController): void {
    const target = this.geometry().webView;
    const quiet = process.env['ORBIT_QUIET'] === '1';
    const steps = quiet ? 1 : 12;
    let step = 0;
    const place = () => {
      if (this.shown !== tab || tab.view.webContents.isDestroyed()) return;
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

  private geometry() {
    return computePeek(contentArea(this.deps.getLayout()));
  }

  /** Takes the showing page out of Peek and returns it. */
  private release(): TabController | null {
    const sourceId = this.shownId;
    const tab = this.shown;
    if (sourceId === null || !tab) return null;
    this.hide();
    this.peeks.delete(sourceId);
    const contents = tab.view.webContents;
    if (!contents.isDestroyed()) contents.off('before-input-event', this.onInput);
    this.deps.onBadgesChange();
    return tab;
  }

  /** A Peek's page changed: its frame (if showing) and its badge follow. */
  private changed(sourceId: string): void {
    if (this.shownId === sourceId) this.sync();
    this.deps.onBadgesChange();
  }

  /** Esc inside the previewed page closes the preview. */
  private readonly onInput = (event: Event, input: Input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape') return;
    if (input.meta || input.control || input.alt || input.shift) return;
    event.preventDefault();
    this.close();
  };

  private sync(): void {
    const tab = this.shown;
    if (!tab || this.deps.win.isDestroyed()) return;
    const area = contentArea(this.deps.getLayout());
    const { frame } = computePeek(area);
    const [width = 0, height = 0] = this.deps.win.getContentSize();
    const { url, title, favicon, isLoading, canGoBack, canGoForward } = tab.state;
    this.deps.overlay.setPeek({
      url,
      title,
      favicon,
      isLoading,
      canGoBack,
      canGoForward,
      frame,
      // The page area and everything right of it; the sidebar stays usable, like Arc.
      cover: { x: area.x, y: 0, width: Math.max(0, width - area.x), height },
      headerHeight: PEEK.headerHeight,
      radius: PEEK.radius,
    });
  }
}
