import { describe, expect, it } from 'vitest';
import {
  childrenAt,
  flatten,
  insertItem,
  moveItem,
  removeItem,
  SidebarError,
} from '../../src/main/sidebar/model';
import type { Position, SidebarItem } from '../../src/main/sidebar/model';

const P = 'p1';
const S = 's1';
const today = (beforeId: string | null = null, parentId: string | null = null): Position => ({
  section: 'today',
  profileId: P,
  spaceId: S,
  parentId,
  beforeId,
});
const pinned = (beforeId: string | null = null, parentId: string | null = null): Position => ({
  section: 'pinned',
  profileId: P,
  spaceId: S,
  parentId,
  beforeId,
});
const favorites = (beforeId: string | null = null): Position => ({
  section: 'favorite',
  profileId: P,
  spaceId: null,
  parentId: null,
  beforeId,
});

const tab = (id: string) => ({
  id,
  kind: 'tab' as const,
  title: id,
  titleOverride: null,
  url: `https://${id}.com/`,
  homeUrl: null,
  favicon: null,
  collapsed: false,
  lastActiveAt: null,
  createdAt: 0,
});
const folder = (id: string) => ({ ...tab(id), kind: 'folder' as const, url: null });

const ids = (items: SidebarItem[], at: Position) => childrenAt(items, at).map((i) => i.id);

function build() {
  let items: SidebarItem[] = [];
  items = insertItem(items, tab('a'), today());
  items = insertItem(items, tab('b'), today());
  items = insertItem(items, tab('c'), today());
  return items;
}

describe('sidebar model', () => {
  it('appends and inserts before a sibling', () => {
    let items = build();
    expect(ids(items, today())).toEqual(['a', 'b', 'c']);
    items = insertItem(items, tab('x'), today('b'));
    expect(ids(items, today())).toEqual(['a', 'x', 'b', 'c']);
  });

  it('reorders without touching other siblings’ keys', () => {
    const items = build();
    const before = Object.fromEntries(items.map((i) => [i.id, i.sortKey]));
    const moved = moveItem(items, 'c', today('a'));
    expect(ids(moved, today())).toEqual(['c', 'a', 'b']);
    expect(moved.find((i) => i.id === 'a')!.sortKey).toBe(before['a']);
    expect(moved.find((i) => i.id === 'b')!.sortKey).toBe(before['b']);
  });

  it('pinning remembers the home URL; unpinning forgets it', () => {
    let items = moveItem(build(), 'a', pinned());
    expect(items.find((i) => i.id === 'a')).toMatchObject({
      section: 'pinned',
      homeUrl: 'https://a.com/',
    });
    items = moveItem(items, 'a', today());
    expect(items.find((i) => i.id === 'a')!.homeUrl).toBeNull();
  });

  it('moves tabs into and out of folders; folders carry their children between sections', () => {
    let items = insertItem(build(), folder('f'), today());
    items = moveItem(items, 'a', today(null, 'f'));
    items = moveItem(items, 'b', today(null, 'f'));
    expect(ids(items, today(null, 'f'))).toEqual(['a', 'b']);
    expect(
      flatten(items, { section: 'today', profileId: P, spaceId: S }).map(
        (x) => `${x.item.id}:${x.depth}`,
      ),
    ).toEqual(['c:0', 'f:0', 'a:1', 'b:1']);

    // Dropping the folder into Pinned pins everything inside it.
    items = moveItem(items, 'f', pinned());
    expect(
      items.filter((i) => ['a', 'b', 'f'].includes(i.id)).every((i) => i.section === 'pinned'),
    ).toBe(true);
    expect(items.find((i) => i.id === 'a')!.homeUrl).toBe('https://a.com/');
  });

  it('refuses impossible moves', () => {
    let items = insertItem(build(), folder('f'), today());
    items = insertItem(items, folder('g'), today(null, 'f'));
    expect(() => moveItem(items, 'f', today(null, 'g'))).toThrow(SidebarError); // into own child
    expect(() => moveItem(items, 'f', today(null, 'f'))).toThrow(SidebarError); // into itself
    expect(() => moveItem(items, 'f', favorites())).toThrow(SidebarError); // folder as favorite
    expect(() => moveItem(items, 'a', today(null, 'b'))).toThrow(SidebarError); // into a tab
    expect(() => moveItem(items, 'a', { ...today(), spaceId: null })).toThrow(SidebarError);
  });

  it('favorites are per profile, flat, and remember home', () => {
    const items = moveItem(build(), 'b', favorites());
    expect(ids(items, favorites())).toEqual(['b']);
    expect(items.find((i) => i.id === 'b')).toMatchObject({
      spaceId: null,
      homeUrl: 'https://b.com/',
    });
  });

  it('removes a folder with everything inside', () => {
    let items = insertItem(build(), folder('f'), today());
    items = moveItem(items, 'a', today(null, 'f'));
    const { items: left, removed } = removeItem(items, 'f');
    expect(removed.map((i) => i.id).sort()).toEqual(['a', 'f']);
    expect(ids(left, today())).toEqual(['b', 'c']);
  });

  it('dropping an item onto itself is a no-op', () => {
    const items = build();
    expect(ids(moveItem(items, 'b', today('b')), today())).toEqual(['a', 'b', 'c']);
  });
});
