import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { SidebarRepository } from '../../src/main/persistence/repositories/sidebar';
import { LiveFolderService } from '../../src/main/live-folders/service';
import type { LiveFetch } from '../../src/main/live-folders/service';
import { SidebarStore } from '../../src/main/sidebar/store';

let db: Database;
afterEach(() => db?.close());

/** A fake web: URL → response body (or status). */
function setup(routes: Record<string, string | number>, open = new Set<string>()) {
  db = openDatabase(':memory:');
  migrate(db, migrations);
  const store = new SidebarStore(new SidebarRepository(db));
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch: LiveFetch = async (url, init) => {
    requests.push({ url, headers: init.headers });
    const body = routes[url];
    if (body === undefined || typeof body === 'number')
      return { ok: false, status: typeof body === 'number' ? body : 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => body };
  };
  const service = new LiveFolderService({
    store,
    fetch,
    isOpen: (id) => open.has(id),
    githubToken: () => 'tok',
  });
  return { store, service, requests, space: store.spaces[0]! };
}

/** A folder's children in sidebar order. */
const children = (store: SidebarStore, folderId: string) =>
  store
    .all()
    .filter((i) => i.parentId === folderId)
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));

const issue = (id: number, number: number, title: string, pull = false) => ({
  id,
  number,
  title,
  html_url: `https://github.com/acme/app/issues/${number}`,
  updated_at: `2026-10-${10 + number}T00:00:00Z`,
  ...(pull ? { pull_request: {} } : {}),
});

describe('LiveFolderService', () => {
  it('GitHub issues: a pinned folder of open issues (pull requests left out), with the token', async () => {
    const api = 'https://api.github.com/repos/acme/app/issues?state=open&per_page=30';
    const { store, service, requests, space } = setup({
      [api]: JSON.stringify([
        issue(1, 1, 'Crash on start'),
        issue(2, 2, 'Add dark mode', true),
        issue(3, 3, 'Typo'),
      ]),
    });
    const folder = await service.create(
      { type: 'github', repo: 'acme/app', what: 'issues' },
      space,
    );
    expect(folder).toMatchObject({ title: 'acme/app · Issues', section: 'pinned', kind: 'folder' });
    expect(children(store, folder.id).map((c) => c.title)).toEqual([
      '#3 Typo',
      '#1 Crash on start',
    ]);
    expect(requests[0]!.headers['Authorization']).toBe('Bearer tok');
    // The first fill isn't "new".
    expect(children(store, folder.id).every((c) => c.data?.feed?.unread === false)).toBe(true);
  });

  it('refresh keeps open tabs, drops gone items, and records errors on the folder', async () => {
    const url = 'https://blog.example.com/feed.xml';
    const rss = (ids: number[]) =>
      `<rss><channel><title>Blog</title>${ids
        .map((i) => `<item><title>P${i}</title><link>https://blog.example.com/${i}</link></item>`)
        .join('')}</channel></rss>`;
    const routes: Record<string, string | number> = { [url]: rss([1, 2]) };
    const open = new Set<string>();
    const { store, service, space } = setup(routes, open);
    const folder = await service.create({ type: 'rss', url }, space);
    const [p1, p2] = children(store, folder.id);
    open.add(p2!.id); // P2 is open in a tab

    routes[url] = rss([3]); // P1 and P2 dropped out of the feed, P3 is new
    await service.refresh(folder.id);
    const titles = children(store, folder.id).map((c) => [c.title, c.data?.feed?.unread]);
    expect(titles).toEqual([
      ['P3', true],
      ['P2', false],
    ]);
    expect(store.item(p1!.id)).toBeUndefined();

    routes[url] = 500;
    await service.refresh(folder.id);
    expect(store.item(folder.id)?.data?.live?.error).toBe('blog.example.com answered 500');
    expect(children(store, folder.id)).toHaveLength(2); // nothing lost

    service.markAllRead(folder.id);
    expect(children(store, folder.id).some((c) => c.data?.feed?.unread)).toBe(false);
  });

  it('refuses a page without a feed', async () => {
    const { service, space, store } = setup({ 'https://x.com/': '<html><head></head></html>' });
    await expect(service.create({ type: 'rss', url: 'https://x.com/' }, space)).rejects.toThrow(
      'No RSS or Atom feed found there',
    );
    expect(store.all().filter((i) => i.kind === 'folder')).toHaveLength(0);
  });
});
