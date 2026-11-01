import type { LiveSource } from '@shared/types/live-folders';
import type { Space } from '../persistence/repositories/sidebar';
import type { SidebarItem } from '../sidebar/model';
import type { SidebarStore } from '../sidebar/store';
import { discoverFeedUrl, latest, parseFeed, planRefresh } from './model';
import type { Feed, FeedItem } from './model';

/** The part of `fetch` the service uses (Electron's `net.fetch` in the app, a fake in tests). */
export type LiveFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const REFRESH_EVERY_MS = 30 * 60_000;
const FIRST_REFRESH_MS = 15_000;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5_000_000;

/**
 * Live Folders (F-28): folders in a space's pinned section whose tabs come from an RSS / Atom
 * feed or a GitHub repository's pull requests or issues. Refreshed every 30 minutes; new items
 * get a dot until opened. Open tabs are never removed by a refresh.
 */
export class LiveFolderService {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private readonly refreshing = new Set<string>();

  constructor(
    private readonly deps: {
      store: SidebarStore;
      fetch: LiveFetch;
      /** True while a tab is open (live) in some window. */
      isOpen: (itemId: string) => boolean;
      /** A GitHub token for private repositories and higher rate limits, if set. */
      githubToken?: () => string | null;
    },
  ) {}

  start(): void {
    const first = setTimeout(() => void this.refreshAll(), FIRST_REFRESH_MS);
    const every = setInterval(() => void this.refreshAll(), REFRESH_EVERY_MS);
    first.unref?.();
    every.unref?.();
    this.timers = [first, every];
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** Checks the source (and names the folder after it), then adds the folder to `space`. */
  async create(source: LiveSource, space: Space): Promise<SidebarItem> {
    const loaded = await this.load(source);
    const { store } = this.deps;
    const folder = store.insert(
      { kind: 'folder', title: loaded.feed.title },
      {
        section: 'pinned',
        profileId: space.profileId,
        spaceId: space.id,
        parentId: null,
        beforeId: null,
      },
    );
    store.setData(folder.id, {
      live: { source: loaded.source, refreshedAt: Date.now(), error: null },
    });
    this.apply(folder.id, latest(loaded.feed.items), true);
    return store.item(folder.id)!;
  }

  folders(): SidebarItem[] {
    return this.deps.store.all().filter((i) => i.kind === 'folder' && i.data?.live);
  }

  async refreshAll(): Promise<void> {
    for (const folder of this.folders()) await this.refresh(folder.id);
  }

  async refresh(folderId: string): Promise<void> {
    const live = this.deps.store.item(folderId)?.data?.live;
    if (!live || this.refreshing.has(folderId)) return;
    this.refreshing.add(folderId);
    try {
      const { feed } = await this.load(live.source);
      this.apply(folderId, latest(feed.items), false);
      this.setStatus(folderId, null);
    } catch (error) {
      this.setStatus(folderId, error instanceof Error ? error.message : String(error));
    } finally {
      this.refreshing.delete(folderId);
    }
  }

  markAllRead(folderId: string): void {
    const { store } = this.deps;
    for (const child of store.all().filter((i) => i.parentId === folderId)) {
      const feed = child.data?.feed;
      if (feed?.unread)
        store.setData(child.id, { ...child.data, feed: { ...feed, unread: false } });
    }
  }

  private setStatus(folderId: string, error: string | null): void {
    const item = this.deps.store.item(folderId);
    const live = item?.data?.live;
    if (!item || !live) return;
    this.deps.store.setData(folderId, {
      ...item.data,
      live: { ...live, refreshedAt: error ? live.refreshedAt : Date.now(), error },
    });
  }

  /** New items go on top (with a dot, except on the first fill); gone ones go away. */
  private apply(folderId: string, items: FeedItem[], first: boolean): void {
    const { store } = this.deps;
    const folder = store.item(folderId);
    if (!folder) return;
    const children = store.all().filter((i) => i.parentId === folderId);
    const plan = planRefresh(
      children.map((c) => ({
        id: c.id,
        guid: c.data?.feed?.guid ?? null,
        open: this.deps.isOpen(c.id),
      })),
      items,
    );
    for (const id of plan.remove) store.remove(id);
    // Oldest first, each to the top, so the newest ends up first.
    for (const item of [...plan.add].reverse()) {
      const tab = store.insert(
        { kind: 'tab', title: item.title, url: item.url },
        {
          section: folder.section,
          profileId: folder.profileId,
          spaceId: folder.spaceId,
          parentId: folderId,
          beforeId: 'first',
        },
      );
      store.setHome(tab.id, item.url);
      store.setData(tab.id, { feed: { guid: item.guid, unread: !first } });
    }
  }

  private async load(source: LiveSource): Promise<{ feed: Feed; source: LiveSource }> {
    if (source.type === 'rss') {
      let url = source.url;
      let text = await this.get(url);
      let feed = parseFeed(text, url);
      if (!feed) {
        // A web page: follow its advertised feed.
        const found = discoverFeedUrl(text, url);
        if (!found) throw new Error('No RSS or Atom feed found there');
        url = found;
        text = await this.get(url);
        feed = parseFeed(text, url);
        if (!feed) throw new Error('That feed couldn’t be read');
      }
      return { feed, source: { type: 'rss', url } };
    }

    const label = source.what === 'pulls' ? 'Pull Requests' : 'Issues';
    const token = this.deps.githubToken?.() ?? null;
    const body = await this.get(
      `https://api.github.com/repos/${source.repo}/${source.what}?state=open&per_page=30`,
      {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    );
    const data = JSON.parse(body) as unknown;
    if (!Array.isArray(data)) throw new Error('GitHub didn’t return a list');
    const items: FeedItem[] = [];
    for (const raw of data as Record<string, unknown>[]) {
      // The issues list includes pull requests; Issues folders leave them out.
      if (source.what === 'issues' && raw['pull_request']) continue;
      const url = typeof raw['html_url'] === 'string' ? raw['html_url'] : '';
      if (!url.startsWith('https://github.com/')) continue;
      const updated = Date.parse(String(raw['updated_at'] ?? ''));
      items.push({
        guid: String(raw['id'] ?? url),
        title: `#${String(raw['number'] ?? '')} ${String(raw['title'] ?? '')}`.trim(),
        url,
        date: Number.isFinite(updated) ? updated : null,
      });
    }
    return { feed: { title: `${source.repo} · ${label}`, items }, source };
  }

  private async get(url: string, headers: Record<string, string> = {}): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.deps.fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        const host = new URL(url).hostname;
        throw new Error(
          response.status === 404 ? `${host}: not found` : `${host} answered ${response.status}`,
        );
      }
      const text = await response.text();
      if (text.length > MAX_BYTES) throw new Error('That feed is too large');
      return text;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(`${new URL(url).hostname} didn’t answer`, { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
