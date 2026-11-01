import { randomUUID } from 'node:crypto';
import type { BrowserWindow, WebContentsView } from 'electron';
import type { Layout } from '@shared/types/layout';
import { NEW_TAB_URL } from '@shared/types/tabs';
import type { TabsSnapshot } from '@shared/types/tabs';
import { insertAfter, nextActiveAfterClose } from './model';
import { TabController } from './tab-controller';
import type { TabEnv } from './tab-controller';

export type TabManagerDeps = Pick<
  TabEnv,
  'internalPreload' | 'loadInternal' | 'registerInternal' | 'unregisterInternal'
> & {
  win: BrowserWindow;
  getLayout: () => Layout;
  onChange: (snapshot: TabsSnapshot) => void;
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

  /** Opens a tab (default: the new tab page) right after the active tab and activates it. */
  create(url: string = NEW_TAB_URL, options: { activate?: boolean } = {}): TabController {
    const id = randomUUID();
    const tab = new TabController(id, url, {
      internalPreload: this.deps.internalPreload,
      loadInternal: this.deps.loadInternal,
      registerInternal: this.deps.registerInternal,
      unregisterInternal: this.deps.unregisterInternal,
      openInNewTab: (link) => this.create(link, { activate: true }),
      onChange: () => this.scheduleNotify(),
      onViewReplaced: (oldView, newView) => this.replaceView(id, oldView, newView),
    });
    this.tabs.set(id, tab);
    this.order = insertAfter(this.order, id, this.activeId ?? undefined);
    this.attach(tab.view);

    if (options.activate ?? true) this.activate(id);
    else this.scheduleNotify();
    return tab;
  }

  activate(id: string): void {
    const next = this.tabs.get(id);
    if (!next) return;
    const previous = this.active;
    if (previous && previous !== next) previous.view.setVisible(false);
    this.activeId = id;
    this.frozen = false;
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
   * Hides the active view behind a still snapshot (for sidebar resizing, when the shell must
   * receive every pointer event). Returns the snapshot as a JPEG data: URL.
   */
  async freeze(): Promise<string | null> {
    const active = this.active;
    if (!active || this.frozen) return null;
    this.frozen = true;
    let snapshot: string | null = null;
    try {
      const image = await active.view.webContents.capturePage();
      if (!image.isEmpty())
        snapshot = `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`;
    } catch {
      // A page that can't be captured just shows the blank card while dragging.
    }
    if (this.frozen) active.view.setVisible(false);
    return snapshot;
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
