import { randomUUID } from 'node:crypto';
import type { BrowserWindow, WebContentsView } from 'electron';
import type { Layout } from '@shared/types/layout';
import { NEW_TAB_URL } from '@shared/types/tabs';
import type { TabsSnapshot } from '@shared/types/tabs';
import { insertAfter, nextActiveAfterClose } from './model';
import type { SavedTab } from '../persistence/repositories/tabs';
import { TabController } from './tab-controller';
import type { TabEnv, TabOptions } from './tab-controller';

/** A pre-drag snapshot older than this is stale (the page may have changed). */
const SNAPSHOT_MAX_AGE_MS = 10_000;

export type TabManagerDeps = Pick<
  TabEnv,
  'internalPreload' | 'loadInternal' | 'registerInternal' | 'unregisterInternal'
> & {
  win: BrowserWindow;
  getLayout: () => Layout;
  onChange: (snapshot: TabsSnapshot) => void;
  /** The active tab's page entered/left HTML fullscreen. */
  onHtmlFullscreen: (enter: boolean) => void;
};

/**
 * One window's tabs (PLAN.md section 4.3): creates, activates and closes them, and keeps the
 * active tab's view sized to the layout. Inactive views stay alive but hidden; sleeping tabs
 * (Phase 4) will destroy them.
 */
export class TabManager {
  private order: string[] = [];
  private readonly tabs = new Map<string, TabController>();
  private activeId: string | null = null;
  private notifyScheduled = false;
  private frozen = false;
  private prepared: { tabId: string; at: number; dataUrl: string } | null = null;

  constructor(private readonly deps: TabManagerDeps) {}

  snapshot(): TabsSnapshot {
    return {
      tabs: this.order.map((id) => this.tabs.get(id)!.state),
      activeTabId: this.activeId,
    };
  }

  get active(): TabController | null {
    return this.activeId ? (this.tabs.get(this.activeId) ?? null) : null;
  }

  get(id: string): TabController | undefined {
    return this.tabs.get(id);
  }

  /** The tab currently showing this webContents, if any. */
  findByContents(webContentsId: number): TabController | undefined {
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents.id === webContentsId) {
        return tab;
      }
    }
    return undefined;
  }

  /** Opens a tab (default: the new tab page) right after the active tab and activates it. */
  create(
    url: string = NEW_TAB_URL,
    options: { activate?: boolean; id?: string } & TabOptions = {},
  ): TabController {
    const { activate, id: savedId, ...tabOptions } = options;
    const id = savedId ?? randomUUID();
    const tab = new TabController(
      id,
      url,
      {
        internalPreload: this.deps.internalPreload,
        loadInternal: this.deps.loadInternal,
        registerInternal: this.deps.registerInternal,
        unregisterInternal: this.deps.unregisterInternal,
        openInNewTab: (link, activate) => this.create(link, { activate }),
        onChange: () => this.scheduleNotify(),
        onViewReplaced: (oldView, newView) => this.replaceView(id, oldView, newView),
        // Only the visible tab may take over the window; leaving is always honoured.
        onHtmlFullscreen: (enter) => {
          if (!enter || this.activeId === id) this.deps.onHtmlFullscreen(enter);
        },
      },
      tabOptions,
    );
    this.tabs.set(id, tab);
    this.order = insertAfter(this.order, id, this.activeId ?? undefined);
    this.attach(tab.view);

    if (activate ?? true) this.activate(id);
    else this.scheduleNotify();
    return tab;
  }

  /**
   * Re-opens saved tabs in order. Only the previously active tab loads now; the rest load when
   * first clicked (cheap startup, and background tabs don't start playing audio).
   */
  restore(saved: readonly SavedTab[]): void {
    for (const s of saved) {
      this.create(s.url, {
        id: s.id,
        activate: false,
        deferLoad: true,
        title: s.title,
        favicon: s.favicon,
      });
    }
    const active = saved.find((s) => s.isActive) ?? saved.at(-1);
    if (active) this.activate(active.id);
  }

  /** The current tabs in a form the repository can save. */
  toSaved(): SavedTab[] {
    return this.order.map((id) => {
      const { url, title, favicon } = this.tabs.get(id)!.state;
      return { id, url, title, favicon, isActive: id === this.activeId };
    });
  }

  /** Previous/next tab (⌃⇧Tab / ⌃Tab), wrapping around. */
  cycle(direction: 1 | -1): void {
    if (this.order.length === 0) return;
    const index = this.activeId ? this.order.indexOf(this.activeId) : -1;
    const next = this.order[(index + direction + this.order.length) % this.order.length];
    if (next) this.activate(next);
  }

  /** ⌘1…⌘8 go to that tab; ⌘9 always goes to the last one (like Chrome). */
  activateIndex(n: number): void {
    const id = n === 9 ? this.order.at(-1) : this.order[n - 1];
    if (id) this.activate(id);
  }

  activate(id: string): void {
    const next = this.tabs.get(id);
    if (!next) return;
    const previous = this.active;
    if (previous && previous !== next) previous.view.setVisible(false);
    this.activeId = id;
    this.frozen = false;
    next.ensureLoaded(); // restored tabs load on first view
    this.place(next.view);
    next.view.setVisible(true);
    next.view.webContents.focus();
    this.scheduleNotify();
  }

  close(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const nextId = nextActiveAfterClose(this.order, id, this.activeId);
    this.detach(tab.view);
    tab.destroy();
    this.tabs.delete(id);
    this.order = this.order.filter((t) => t !== id);
    this.activeId = null;
    if (nextId && nextId !== id) this.activate(nextId);
    else this.scheduleNotify();
  }

  /**
   * Captures the active page ahead of a possible sidebar drag (the shell calls this when the
   * pointer reaches the sidebar edge), so `freeze()` can hide the view instantly.
   */
  async prepareFreeze(): Promise<void> {
    const active = this.active;
    if (!active) return;
    try {
      const image = await active.view.webContents.capturePage();
      if (image.isEmpty() || this.activeId !== active.id) return;
      this.prepared = {
        tabId: active.id,
        at: Date.now(),
        dataUrl: `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`,
      };
    } catch {
      // A page that can't be captured just shows the blank card while dragging.
    }
  }

  /**
   * Hides the active view immediately (sidebar resizing: native views swallow pointer events,
   * so the shell must receive them all) and returns the prepared snapshot to show in its place.
   */
  freeze(): string | null {
    const active = this.active;
    if (!active || this.frozen) return null;
    this.frozen = true;
    active.view.setVisible(false);
    const prepared = this.prepared;
    this.prepared = null;
    const fresh =
      prepared && prepared.tabId === active.id && Date.now() - prepared.at < SNAPSHOT_MAX_AGE_MS;
    return fresh ? prepared.dataUrl : null;
  }

  /** Shows the active view again after `freeze()`. */
  unfreeze(): void {
    if (!this.frozen) return;
    this.frozen = false;
    const active = this.active;
    if (active) {
      this.place(active.view);
      active.view.setVisible(true);
    }
  }

  /** Re-applies bounds after a layout change (sidebar toggle, resize…). */
  applyLayout(): void {
    const active = this.active;
    if (active) this.place(active.view);
  }

  /** Closes every view; call when the window closes so web contents don't leak. */
  destroyAll(): void {
    for (const tab of this.tabs.values()) tab.destroy();
    this.tabs.clear();
    this.order = [];
    this.activeId = null;
  }

  private place(view: WebContentsView): void {
    const layout = this.deps.getLayout();
    view.setBounds(layout.webView);
    view.setBorderRadius(layout.radius);
  }

  private attach(view: WebContentsView): void {
    view.setVisible(false);
    // Index 0 keeps tabs below anything added later (the overlay view in Phase 2).
    this.deps.win.contentView.addChildView(view, 0);
  }

  private detach(view: WebContentsView): void {
    if (!this.deps.win.isDestroyed()) this.deps.win.contentView.removeChildView(view);
  }

  private replaceView(id: string, oldView: WebContentsView, newView: WebContentsView): void {
    this.detach(oldView);
    this.attach(newView);
    if (this.activeId === id) {
      this.place(newView);
      newView.setVisible(true);
      newView.webContents.focus();
    }
  }

  /** Coalesces bursts of tab events (title + favicon + loading…) into one snapshot per tick. */
  private scheduleNotify(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      if (!this.deps.win.isDestroyed()) this.deps.onChange(this.snapshot());
    });
  }
}
