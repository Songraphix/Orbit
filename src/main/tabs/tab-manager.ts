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
import { inSplit, makeSplit, partnerOf, splitAfterActivate, swapped, withRatio } from './split';
import type { Split } from './split';
import { TabController } from './tab-controller';
import type { TabEnv } from './tab-controller';
import { randomUUID } from 'node:crypto';

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
  /** A site's own setting by page URL (Developer Mode…). */
  siteSetting?: (url: string, key: string) => string | null;
  /** Offered every link that wants a new tab; returns true if Peek took it (F-23). */
  peek?: (fromTabId: string, url: string, activate: boolean) => boolean;
  /** Split view started, resized or ended (null): the layout needs the new ratio. */
  onSplitChange?: (ratio: number | null) => void;
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
  /** Split view (F-13): two tabs side by side; `activeId` is the focused pane. */
  private split: Split | null = null;
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

  /** The active tab, or either split pane. */
  isOnScreen(id: string): boolean {
    return this.shownIds().includes(id);
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
      split: this.split ? { tabIds: [...this.split.ids], ratio: this.split.ratio } : null,
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
    const before = this.shownIds();
    const split = splitAfterActivate(this.split, id);
    const splitEnded = split !== this.split;
    this.split = split;
    this.activeId = id;
    this.frozen = false;
    this.hideUnshown(before);
    if (splitEnded) this.deps.onSplitChange?.(null);
    this.place();
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
    // Closing a split pane leaves its partner on screen, full width.
    const partner = partnerOf(this.split, id);
    const wasActive = this.activeId === id || partner !== null; // read before unload() clears it
    const nextId = partner ?? (wasActive ? nextActiveAfterClose(order, id, id) : this.activeId);

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
    const partner = partnerOf(this.split, id);
    if (partner) {
      this.split = null;
      if (this.activeId === id) this.activeId = partner;
      this.deps.onSplitChange?.(null);
    }
    this.detach(tab.view);
    tab.destroy();
    this.live.delete(id);
    if (this.activeId === id) this.activeId = null;
    this.scheduleNotify();
  }

  // ── Peek (F-23) ────────────────────────────────────────────────────────────

  /** A page outside the sidebar (the Peek preview), in the session of the tab it came from. */
  createDetached(url: string, fromTabId: string, onChange: () => void): TabController {
    const from = this.deps.store.item(fromTabId);
    const id = randomUUID();
    const tab = new TabController(
      id,
      url,
      {
        ...this.envFor(id),
        // Links inside the preview open as ordinary tabs.
        openInNewTab: (link, activate) => this.create(link, { activate }),
        onChange,
        onViewReplaced: () => undefined,
        onHtmlFullscreen: () => undefined,
        onFoundInPage: () => undefined,
        onFocus: undefined,
        onMedia: undefined,
        onUnresponsive: undefined,
      },
      { session: this.deps.sessionFor(from?.profileId ?? this.space.profileId) },
    );
    return tab;
  }

  /** "Open as Tab": the detached page joins Today at the top, without reloading. */
  adopt(tab: TabController): void {
    const space = this.space;
    const { url, title, favicon } = tab.state;
    this.deps.store.insert(
      { id: tab.id, kind: 'tab', title, url, favicon },
      {
        section: 'today',
        profileId: space.profileId,
        spaceId: space.id,
        parentId: null,
        beforeId: 'first',
      },
    );
    tab.setEnv(this.envFor(tab.id));
    this.live.set(tab.id, tab);
    this.attach(tab.view);
    this.activate(tab.id);
  }

  // ── Split view (F-13) ──────────────────────────────────────────────────────

  get splitIds(): readonly string[] | null {
    return this.split?.ids ?? null;
  }

  /** Shows `otherId` beside the active tab (it takes focus). Tabs from other spaces can't join. */
  splitWith(otherId: string): void {
    const item = this.deps.store.item(otherId);
    if (!item || item.kind !== 'tab') return;
    if (item.spaceId && item.spaceId !== this.spaceId) return;
    const leftId = this.activeId;
    const split = leftId ? makeSplit(leftId, otherId) : null;
    if (!split) {
      this.activate(otherId);
      return;
    }
    const other = this.ensureLive(item);
    const before = this.shownIds();
    this.split = split;
    this.activeId = otherId;
    this.frozen = false;
    this.hideUnshown(before);
    this.deps.onSplitChange?.(split.ratio);
    this.place();
    other.view.webContents.focus();
    this.deps.store.updateSpace(this.spaceId, { lastActiveItemId: otherId });
    this.deps.store.updateLive(otherId, { lastActiveAt: Date.now() });
    this.scheduleNotify();
  }

  /** Splits the active tab with a new tab (the new tab page by default). */
  splitWithNew(url: string = NEW_TAB_URL): TabController {
    const tab = this.create(url, { activate: false });
    this.splitWith(tab.id);
    return tab;
  }

  /** Back to one page: the focused pane stays. */
  exitSplit(): void {
    if (!this.split) return;
    const before = this.shownIds();
    this.split = null;
    this.hideUnshown(before);
    this.deps.onSplitChange?.(null);
    this.place();
    this.scheduleNotify();
  }

  setSplitRatio(ratio: number): void {
    if (!this.split) return;
    this.split = withRatio(this.split, ratio);
    this.deps.onSplitChange?.(this.split.ratio);
    this.scheduleNotify();
  }

  swapSplit(): void {
    if (!this.split) return;
    this.split = swapped(this.split);
    this.deps.onSplitChange?.(this.split.ratio);
    this.place();
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
          isActive: i.id === this.activeId || inSplit(this.split, i.id),
          isAudible: tab
            ? !tab.view.webContents.isDestroyed() && tab.view.webContents.isCurrentlyAudible()
            : false,
          keep: this.devModeFor(tab?.state.url ?? i.url),
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
    for (const id of this.shownIds()) this.live.get(id)?.view.setVisible(false);
    if (this.split) return null; // two panes: the shell shows plain cards while dragging
    const prepared = this.prepared;
    this.prepared = null;
    const fresh =
      prepared && prepared.tabId === active.id && Date.now() - prepared.at < SNAPSHOT_MAX_AGE_MS;
    return fresh ? prepared.dataUrl : null;
  }

  unfreeze(): void {
    if (!this.frozen) return;
    this.frozen = false;
    this.place();
  }

  /** Re-applies bounds after a layout change (sidebar toggle, resize…). */
  applyLayout(): void {
    this.place();
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
    this.split = null;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private setSpace(spaceId: string, showRemembered: boolean): void {
    for (const id of this.shownIds()) this.live.get(id)?.view.setVisible(false);
    this.activeId = null;
    if (this.split) {
      this.split = null;
      this.deps.onSplitChange?.(null);
    }
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
    const tab = new TabController(item.id, item.url ?? NEW_TAB_URL, this.envFor(item.id), {
      title: item.titleOverride || item.title,
      favicon: item.favicon,
      session: this.deps.sessionFor(item.profileId),
    });
    this.live.set(item.id, tab);
    this.attach(tab.view);
    return tab;
  }

  /** How a tab in this window reports back (looked up by id, so a tab can be handed over). */
  private envFor(id: string): TabEnv {
    return {
      internalPreload: this.deps.internalPreload,
      loadInternal: this.deps.loadInternal,
      registerInternal: this.deps.registerInternal,
      unregisterInternal: this.deps.unregisterInternal,
      history: this.deps.history,
      zoomFor: this.deps.zoomFor,
      onFoundInPage: (result) => {
        if (this.activeId === id) this.deps.onFoundInPage(result);
      },
      openInNewTab: (link, activate) => this.openLink(id, link, activate),
      onUnresponsive: () => this.deps.onUnresponsive?.(id),
      onMedia: (event) => this.deps.onMedia?.(id, event),
      onChange: () => {
        const tab = this.live.get(id);
        if (this.disposed || !tab) return;
        const { url, title, favicon } = tab.state;
        // A crashed page is hidden so the shell's Reload card shows through.
        if (this.shownIds().includes(id)) this.place();
        this.deps.store.updateLive(id, { url, title, favicon });
        this.scheduleNotify();
      },
      onViewReplaced: (oldView, newView) => this.replaceView(id, oldView, newView),
      // Only the visible tab may take over the window; leaving is always honoured.
      onHtmlFullscreen: (enter) => {
        if (!enter || this.activeId === id) this.deps.onHtmlFullscreen(enter);
      },
      // Clicking into the other split pane focuses it.
      onFocus: () => {
        if (this.disposed || this.activeId === id || !inSplit(this.split, id)) return;
        this.activeId = id;
        this.deps.store.updateSpace(this.spaceId, { lastActiveItemId: id });
        this.scheduleNotify();
      },
    };
  }

  /** A link that wants a new tab: Peek (pinned/favorite → another site), else a Today tab. */
  private openLink(fromId: string, url: string, activate: boolean): void {
    if (this.deps.peek?.(fromId, url, activate)) return;
    this.create(url, { activate });
  }

  private tabState(item: SidebarItem): TabState {
    const tab = this.live.get(item.id);
    if (tab) {
      const state = { ...tab.state, devMode: this.devModeFor(tab.state.url) };
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
      devMode: this.devModeFor(url),
      consoleErrors: 0,
    };
  }

  private devModeFor(url: string | null): boolean {
    return url !== null && !isInternal(url) && this.deps.siteSetting?.(url, 'devMode') === 'on';
  }

  /** Re-sends the snapshot (e.g. after a site setting changed). */
  refresh(): void {
    this.scheduleNotify();
  }

  /** The tabs on screen: both split panes, or just the active tab. */
  private shownIds(): string[] {
    if (this.split) return [...this.split.ids];
    return this.activeId ? [this.activeId] : [];
  }

  /** Hides views that were on screen (`before`) and no longer are. */
  private hideUnshown(before: string[]): void {
    const shown = this.shownIds();
    for (const id of before) if (!shown.includes(id)) this.live.get(id)?.view.setVisible(false);
  }

  /** Puts every on-screen view where the layout says (split panes, or the one web view). */
  private place(): void {
    const layout = this.deps.getLayout();
    const panes = this.split && layout.panes.length === 2 ? layout.panes : null;
    this.shownIds().forEach((id, i) => {
      const tab = this.live.get(id);
      if (!tab) return;
      // HTML fullscreen in split view: only the focused pane gets the window.
      const bounds = panes ? panes[i]!.webView : id === this.activeId ? layout.webView : null;
      if (!bounds) {
        tab.view.setVisible(false);
        return;
      }
      tab.view.setBounds(bounds);
      tab.view.setBorderRadius(layout.radius);
      tab.view.setVisible(!this.frozen && !tab.state.crashed);
    });
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
    if (this.shownIds().includes(id)) this.place();
    if (this.activeId === id) newView.webContents.focus();
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
