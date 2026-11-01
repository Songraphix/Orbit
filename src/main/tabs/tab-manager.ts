import type { BrowserWindow, Session, WebContentsView } from 'electron';
import type { Layout } from '@shared/types/layout';
import type { SidebarRow, SidebarSnapshot } from '@shared/types/space';
import { NEW_TAB_URL } from '@shared/types/tabs';
import type { TabState, TabsSnapshot } from '@shared/types/tabs';
import type { TabFacts } from '../archive/policy';
import type {
  ArchiveEntry,
  ArchiveReason,
  ArchiveRepository,
} from '../persistence/repositories/archive';
import type { Space } from '../persistence/repositories/sidebar';
import type { Section, SidebarItem } from '../sidebar/model';
import type { SidebarStore } from '../sidebar/store';
import { nextActiveAfterClose } from './model';
import { TabController } from './tab-controller';
import type { TabEnv } from './tab-controller';

/** A pre-drag snapshot older than this is stale (the page may have changed). */
const SNAPSHOT_MAX_AGE_MS = 10_000;

export type TabManagerDeps = Pick<
  TabEnv,
  | 'internalPreload'
  | 'loadInternal'
  | 'registerInternal'
  | 'unregisterInternal'
  | 'history'
  | 'zoomFor'
> & {
  win: BrowserWindow;
  store: SidebarStore;
  archive: ArchiveRepository;
  initialSpaceId: string;
  getLayout: () => Layout;
  /** Session for a profile (each profile has its own cookies and logins). */
  sessionFor: (profileId: string) => Session | undefined;
  onChange: (tabs: TabsSnapshot, sidebar: SidebarSnapshot) => void;
  onSpaceChange: (spaceId: string) => void;
  /** The active tab's page entered/left HTML fullscreen. */
  onHtmlFullscreen: (enter: boolean) => void;
  /** Find-in-page results from the active tab. */
  onFoundInPage: TabEnv['onFoundInPage'];
  /** A tab's page stopped responding. */
  onUnresponsive?: (tabId: string) => void;
  /** A tab's media started or stopped. */
  onMedia?: (tabId: string, event: 'playing' | 'paused') => void;
};

const isInternal = (url: string | null) => (url ?? '').startsWith('orbit://');

/**
 * One window's tabs (PLAN.md section 4.3). The sidebar store owns *which* tabs exist and in what
 * order; this owns their live pages. A tab gets a WebContentsView only once it's opened, so
 * restored, pinned and favorite tabs cost nothing until clicked.
 */
export class TabManager {
  private readonly live = new Map<string, TabController>();
  private spaceId: string;
  private activeId: string | null = null;
  private notifyScheduled = false;
  private frozen = false;
  private prepared: { tabId: string; at: number; dataUrl: string } | null = null;
  private readonly unsubscribe: () => void;
  /** Set once the window closes; late page events (pages unloading) are then ignored. */
  private disposed = false;

  constructor(private readonly deps: TabManagerDeps) {
    this.spaceId = deps.store.space(deps.initialSpaceId)
      ? deps.initialSpaceId
      : deps.store.spaces[0]!.id;
    this.unsubscribe = deps.store.onChange(() => this.scheduleNotify());
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  get space(): Space {
    return this.deps.store.space(this.spaceId) ?? this.deps.store.spaces[0]!;
  }

  get activeSpaceId(): string {
    return this.space.id;
  }

  get active(): TabController | null {
    return this.activeId ? (this.live.get(this.activeId) ?? null) : null;
  }

  get activeItemId(): string | null {
    return this.activeId;
  }

  get(id: string): TabController | undefined {
    return this.live.get(id);
  }

  /** The tab currently showing this webContents, if any. */
  findByContents(webContentsId: number): TabController | undefined {
    for (const tab of this.live.values()) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents.id === webContentsId) {
        return tab;
      }
    }
    return undefined;
  }

  /** Every tab the active space shows (favorites, pinned, Today), live state merged in. */
  snapshot(): TabsSnapshot {
    return {
      tabs: this.deps.store.tabsInOrder(this.space).map((item) => this.tabState(item)),
      activeTabId: this.activeId,
    };
  }

  sidebarSnapshot(): SidebarSnapshot {
    const space = this.space;
    const rows = (section: Section): SidebarRow[] =>
      this.deps.store.rows(section, space).map(({ item, depth }) => {
        const tab = this.live.get(item.id);
        const url = tab?.state.url ?? item.url;
        return {
          id: item.id,
          kind: item.kind,
          section: item.section,
          parentId: item.parentId,
          depth,
          title: item.titleOverride || (tab?.state.title ?? item.title) || url || 'Untitled',
          url,
          favicon: tab?.state.favicon ?? item.favicon,
          collapsed: item.collapsed,
          live: tab !== undefined,
          isLoading: tab?.state.isLoading ?? false,
          awayFromHome: item.homeUrl !== null && url !== null && !sameUrl(url, item.homeUrl),
        };
      });
    return {
      spaces: this.deps.store.spaces.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        profileId: s.profileId,
        theme: s.theme,
      })),
      activeSpaceId: space.id,
      favorites: rows('favorite'),
      pinned: rows('pinned'),
      today: rows('today'),
      activeItemId: this.activeId,
    };
  }

  // ── Opening, switching, closing ────────────────────────────────────────────

  /** Opens a new Today tab at the top of the list (Arc), by default the new tab page. */
  create(url: string = NEW_TAB_URL, options: { activate?: boolean } = {}): TabController {
    const space = this.space;
    const item = this.deps.store.insert(
      { kind: 'tab', title: isInternal(url) ? 'New Tab' : url, url },
      {
        section: 'today',
        profileId: space.profileId,
        spaceId: space.id,
        parentId: null,
        beforeId: 'first',
      },
    );
    const tab = this.ensureLive(item);
    if (options.activate ?? true) this.activate(item.id);
    else this.scheduleNotify();
    return tab;
  }

  /** Shows a tab, loading it if needed. Tabs from another space switch to that space. */
  activate(id: string): void {
    const item = this.deps.store.item(id);
    if (!item || item.kind !== 'tab') return;
    if (item.spaceId && item.spaceId !== this.spaceId) this.setSpace(item.spaceId, false);

    const next = this.ensureLive(item);
    const previous = this.active;
    if (previous && previous !== next) previous.view.setVisible(false);
    this.activeId = id;
    this.frozen = false;
    this.place(next.view);
    next.view.setVisible(!next.state.crashed);
    next.view.webContents.focus();
    this.deps.store.updateSpace(this.spaceId, { lastActiveItemId: id });
    this.deps.store.updateLive(id, { lastActiveAt: Date.now() });
    this.scheduleNotify();
  }

  /**
   * Closing a Today tab removes it (⇧⌘T can bring it back). Closing a pinned tab or favorite
   * only unloads it and resets it to its home URL, like Arc.
   */
  close(id: string, reason: ArchiveReason = 'closed'): void {
    const item = this.deps.store.item(id);
    if (!item) return;
    const order = this.deps.store.tabsInOrder(this.space).map((i) => i.id);
    const wasActive = this.activeId === id; // read before unload() clears it
    const nextId = wasActive ? nextActiveAfterClose(order, id, id) : this.activeId;

    this.unload(id);
    if (item.section === 'today') {
      const { url, title, favicon } = this.live.get(id)?.state ?? item;
      // Into the archive (F-20); new tab pages aren't worth keeping.
      if (url && !isInternal(url)) {
        this.deps.archive.add({
          spaceId: item.spaceId,
          profileId: item.profileId,
          url,
          title: item.titleOverride || title,
          favicon,
          reason,
        });
      }
      this.deps.store.remove(id);
    } else if (item.homeUrl) {
      this.deps.store.updateLive(id, { url: item.homeUrl });
    }

    if (wasActive) {
      this.activeId = null;
      if (nextId && nextId !== id) this.activate(nextId);
    }
    this.scheduleNotify();
  }

  /** Destroys a tab's live page but keeps the sidebar item (pinned close, space deletion…). */
  unload(id: string): void {
    const tab = this.live.get(id);
    if (!tab) return;
    this.detach(tab.view);
    tab.destroy();
    this.live.delete(id);
    if (this.activeId === id) this.activeId = null;
    this.scheduleNotify();
  }

  /** Pinned tab or favorite that wandered off: go back to its home URL. */
  goHome(id: string): void {
    const item = this.deps.store.item(id);
    if (!item?.homeUrl) return;
    const tab = this.live.get(id);
    if (tab) tab.load(item.homeUrl);
    else this.deps.store.updateLive(id, { url: item.homeUrl });
    this.activate(id);
  }

  /** ⇧⌘T: reopens the most recently archived tab, at the top of Today in its space. */
  reopenClosed(): TabController | null {
    const entry = this.deps.archive.takeLatest();
    return entry ? this.restoreEntry(entry) : null;
  }

  /** Restores a tab from the archive (Archived Tabs page). */
  restoreFromArchive(archiveId: string): TabController | null {
    const entry = this.deps.archive.get(archiveId);
    if (!entry) return null;
    this.deps.archive.remove(archiveId);
    return this.restoreEntry(entry);
  }

  private restoreEntry(entry: ArchiveEntry): TabController {
    if (entry.spaceId && this.deps.store.space(entry.spaceId) && entry.spaceId !== this.spaceId) {
      this.setSpace(entry.spaceId, false);
    }
    const tab = this.create(entry.url);
    this.deps.store.updateLive(tab.id, { title: entry.title, favicon: entry.favicon });
    return tab;
  }

  /** What the archive and sleep policies need to know about this window's tabs. */
  facts(): TabFacts[] {
    return this.deps.store
      .all()
      .filter((i) => i.kind === 'tab')
      .map((i) => {
        const tab = this.live.get(i.id);
        return {
          id: i.id,
          section: i.section,
          lastActiveAt: i.lastActiveAt,
          live: tab !== undefined,
          isActive: i.id === this.activeId,
          isAudible: tab
            ? !tab.view.webContents.isDestroyed() && tab.view.webContents.isCurrentlyAudible()
            : false,
        };
      });
  }

  /** Switches the window to another space, showing the tab it had open. */
  switchSpace(spaceId: string): void {
    if (spaceId === this.spaceId || !this.deps.store.space(spaceId)) return;
    this.setSpace(spaceId, true);
  }

  /** ⌃⌘← / ⌃⌘→ and swipes: previous/next space, wrapping around. */
  cycleSpace(direction: 1 | -1): void {
    const spaces = this.deps.store.spaces;
    const index = spaces.findIndex((s) => s.id === this.spaceId);
    const next = spaces[(index + direction + spaces.length) % spaces.length];
    if (next) this.switchSpace(next.id);
  }

  /** Previous/next tab (⌃⇧Tab / ⌃Tab) within the space, wrapping around. */
  cycle(direction: 1 | -1): void {
    const order = this.deps.store.tabsInOrder(this.space).map((i) => i.id);
    if (order.length === 0) return;
    const index = this.activeId ? order.indexOf(this.activeId) : -1;
    const next = order[(index + direction + order.length) % order.length];
    if (next) this.activate(next);
  }

  /** ⌘1…⌘8 go to that tab; ⌘9 always goes to the last one (like Chrome). */
  activateIndex(n: number): void {
    const order = this.deps.store.tabsInOrder(this.space).map((i) => i.id);
    const id = n === 9 ? order.at(-1) : order[n - 1];
    if (id) this.activate(id);
  }

  // ── Sidebar-resize snapshot (see ShellApp) ────────────────────────────────

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

  /** Closes every live page; call when the window closes so web contents don't leak. */
  destroyAll(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.deps.store.flushLive();
    for (const tab of this.live.values()) tab.destroy();
    this.live.clear();
    this.activeId = null;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private setSpace(spaceId: string, showRemembered: boolean): void {
    this.active?.view.setVisible(false);
    this.activeId = null;
    this.spaceId = spaceId;
    this.deps.onSpaceChange(spaceId);
    if (showRemembered) {
      const remembered = this.space.lastActiveItemId;
      if (remembered && this.deps.store.item(remembered)) this.activate(remembered);
    }
    this.scheduleNotify();
  }

  private ensureLive(item: SidebarItem): TabController {
    const existing = this.live.get(item.id);
    if (existing) return existing;
    const id = item.id;
    const tab = new TabController(
      id,
      item.url ?? NEW_TAB_URL,
      {
        internalPreload: this.deps.internalPreload,
        loadInternal: this.deps.loadInternal,
        registerInternal: this.deps.registerInternal,
        unregisterInternal: this.deps.unregisterInternal,
        history: this.deps.history,
        zoomFor: this.deps.zoomFor,
        onFoundInPage: (result) => {
          if (this.activeId === id) this.deps.onFoundInPage(result);
        },
        openInNewTab: (link, activate) => this.create(link, { activate }),
        onUnresponsive: () => this.deps.onUnresponsive?.(id),
        onMedia: (event) => this.deps.onMedia?.(id, event),
        onChange: () => {
          if (this.disposed) return;
          const { url, title, favicon, crashed } = tab.state;
          // A crashed page is hidden so the shell's Reload card shows through.
          if (this.activeId === id && !this.frozen) tab.view.setVisible(!crashed);
          this.deps.store.updateLive(id, { url, title, favicon });
          this.scheduleNotify();
        },
        onViewReplaced: (oldView, newView) => this.replaceView(id, oldView, newView),
        // Only the visible tab may take over the window; leaving is always honoured.
        onHtmlFullscreen: (enter) => {
          if (!enter || this.activeId === id) this.deps.onHtmlFullscreen(enter);
        },
      },
      {
        title: item.titleOverride || item.title,
        favicon: item.favicon,
        session: this.deps.sessionFor(item.profileId),
      },
    );
    this.live.set(id, tab);
    this.attach(tab.view);
    return tab;
  }

  private tabState(item: SidebarItem): TabState {
    const tab = this.live.get(item.id);
    if (tab) {
      const state = tab.state;
      return item.titleOverride ? { ...state, title: item.titleOverride } : state;
    }
    const url = item.url ?? NEW_TAB_URL;
    return {
      id: item.id,
      url,
      title: item.titleOverride || item.title || url,
      favicon: item.favicon,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      kind: isInternal(url) ? 'internal' : 'web',
      crashed: false,
    };
  }

  private place(view: WebContentsView): void {
    const layout = this.deps.getLayout();
    view.setBounds(layout.webView);
    view.setBorderRadius(layout.radius);
  }

  private attach(view: WebContentsView): void {
    view.setVisible(false);
    // Index 0 keeps tabs below the overlay view.
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

  /** Coalesces bursts of events into one snapshot per tick. */
  private scheduleNotify(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      if (this.disposed || this.deps.win.isDestroyed()) return;
      this.deps.onChange(this.snapshot(), this.sidebarSnapshot());
    });
  }
}

function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return norm(a) === norm(b);
}
