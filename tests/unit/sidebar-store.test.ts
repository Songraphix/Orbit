import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_ID, DEFAULT_SPACE_ID } from '@shared/types/space';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { SidebarRepository } from '../../src/main/persistence/repositories/sidebar';
import { SidebarStore } from '../../src/main/sidebar/store';

let db: Database;
afterEach(() => db?.close());

function freshDb() {
  db = openDatabase(':memory:');
  migrate(db, migrations);
  return db;
}
const today = {
  section: 'today' as const,
  profileId: DEFAULT_PROFILE_ID,
  spaceId: DEFAULT_SPACE_ID,
  parentId: null,
};

describe('SidebarStore', () => {
  it('creates a default profile and space on first run', () => {
    const store = new SidebarStore(new SidebarRepository(freshDb()));
    expect(store.profiles.map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(store.spaces.map((s) => [s.id, s.name, s.icon])).toEqual([
      [DEFAULT_SPACE_ID, 'Personal', 'planet'],
    ]);
  });

  it('moves Phase 1 saved tabs into Today and keeps the active one', () => {
    freshDb();
    const insert = db.prepare(
      'INSERT INTO tabs (id, position, url, title, favicon, is_active, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0)',
    );
    insert.run('t1', 0, 'https://a.com/', 'A', 0);
    insert.run('t2', 1, 'https://b.com/', 'B', 1);
    const store = new SidebarStore(new SidebarRepository(db));
    const space = store.space(DEFAULT_SPACE_ID)!;
    expect(store.rows('today', space).map((r) => r.item.title)).toEqual(['A', 'B']);
    expect(space.lastActiveItemId).toBe('t2');
    expect(db.prepare('SELECT COUNT(*) AS n FROM tabs').get()).toEqual({ n: 0 });
  });

  it('persists structure immediately and survives a reload', () => {
    freshDb();
    const store = new SidebarStore(new SidebarRepository(db));
    const folder = store.insert(
      { kind: 'folder', title: 'The Wood' },
      { ...today, beforeId: null },
    );
    const tab = store.insert(
      { kind: 'tab', title: 'A', url: 'https://a.com/' },
      { ...today, beforeId: 'first' },
    );
    store.move(tab.id, { ...today, parentId: folder.id, beforeId: null });
    store.setCollapsed(folder.id, true);

    const reloaded = new SidebarStore(new SidebarRepository(db));
    const space = reloaded.space(DEFAULT_SPACE_ID)!;
    // Collapsed folder hides its child.
    expect(reloaded.rows('today', space).map((r) => r.item.title)).toEqual(['The Wood']);
    expect(reloaded.item(tab.id)!.parentId).toBe(folder.id);
  });

  it('debounces live updates but flushes on demand', () => {
    freshDb();
    const store = new SidebarStore(new SidebarRepository(db));
    const tab = store.insert(
      { kind: 'tab', title: 'A', url: 'https://a.com/' },
      { ...today, beforeId: null },
    );
    store.updateLive(tab.id, { title: 'A — loaded' });
    expect(store.item(tab.id)!.title).toBe('A — loaded'); // in memory at once
    store.flushLive();
    const reloaded = new SidebarStore(new SidebarRepository(db));
    expect(reloaded.item(tab.id)!.title).toBe('A — loaded');
  });

  it('creates, reorders and deletes spaces, keeping at least one', () => {
    freshDb();
    const store = new SidebarStore(new SidebarRepository(db));
    const work = store.createSpace({ name: 'Work', icon: 'video' });
    store.insert(
      { kind: 'tab', title: 'W', url: 'https://w.com/' },
      { ...today, spaceId: work.id, beforeId: null },
    );
    store.reorderSpace(work.id, DEFAULT_SPACE_ID);
    expect(store.spaces.map((s) => s.name)).toEqual(['Work', 'Personal']);
    expect(store.deleteSpace(work.id).map((i) => i.title)).toEqual(['W']);
    expect(store.deleteSpace(DEFAULT_SPACE_ID)).toEqual([]); // last space stays
    expect(new SidebarStore(new SidebarRepository(db)).spaces).toHaveLength(1);
  });
});

describe('profiles', () => {
  it('renames, and deletes only an unused, non-default profile (with its favorites)', () => {
    const store = new SidebarStore(new SidebarRepository(freshDb()));
    const work = store.createProfile('Work');
    store.renameProfile(work.id, '  Office  ');
    expect(store.profiles.find((p) => p.id === work.id)?.name).toBe('Office');
    store.updateProfile(work.id, { displayName: 'Joseph', avatar: '💼', color: '#0a84ff' });
    store.updateProfile(work.id, { avatar: 'not an emoji' });
    expect(store.profiles.find((p) => p.id === work.id)).toMatchObject({
      name: 'Office',
      displayName: 'Joseph',
      avatar: '💼',
      color: '#0a84ff',
    });
    expect(store.deleteProfile(DEFAULT_PROFILE_ID)).toBe(false);

    const space = store.createSpace({ name: 'Job', icon: 'briefcase', profileId: work.id });
    store.insert(
      { kind: 'tab', title: 'Mail', url: 'https://mail.example.com/' },
      { section: 'favorite', profileId: work.id, spaceId: null, parentId: null, beforeId: null },
    );
    expect(store.deleteProfile(work.id)).toBe(false); // a space still uses it

    store.updateSpace(space.id, { profileId: DEFAULT_PROFILE_ID });
    expect(store.deleteProfile(work.id)).toBe(true);
    expect(store.profiles.map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(store.all().some((i) => i.profileId === work.id)).toBe(false);
    // And it stays deleted.
    expect(new SidebarStore(new SidebarRepository(db)).profiles).toHaveLength(1);
  });
});
