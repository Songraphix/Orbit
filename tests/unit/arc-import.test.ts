import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createFakeArcFolder } from '../fixtures/fake-arc';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArcImporter, findArcSources, toSpaceTheme } from '../../src/main/importer/arc/import';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { HistoryRepository } from '../../src/main/persistence/repositories/history';
import { SidebarRepository } from '../../src/main/persistence/repositories/sidebar';
import { SidebarStore } from '../../src/main/sidebar/store';

const dirs: string[] = [];
const track = (dir: string) => {
  dirs.push(dir);
  return dir;
};
let db: Database | undefined;
afterEach(() => {
  if (db?.isOpen) db.close();
  db = undefined;
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function setup() {
  db = openDatabase(':memory:');
  migrate(db, migrations);
  const store = new SidebarStore(new SidebarRepository(db));
  const history = new HistoryRepository(db);
  return { store, history, importer: new ArcImporter(store, history) };
}

describe('ArcImporter', () => {
  it('previews counts before importing', () => {
    const { importer } = setup();
    const dir = track(createFakeArcFolder());
    expect(importer.preview(dir)).toMatchObject({
      spaces: 2,
      favorites: 2,
      pinned: 2,
      today: 1,
      history: 1,
      spaceNames: ['silence', 'Work'],
    });
  });

  it('imports spaces, profiles, folders, favorites and history', () => {
    const { store, history, importer } = setup();
    const result = importer.import(track(createFakeArcFolder()));
    expect(result).toEqual({
      spacesAdded: 2,
      spacesSkipped: 0,
      favoritesAdded: 2,
      tabsAdded: 3,
      historyImported: 1,
    });
    const silence = store.space('arc-S1')!;
    expect([silence.name, silence.icon]).toEqual(['silence', 'cloudOutline']);
    expect(store.rows('pinned', silence).map((r) => `${r.item.title}:${r.depth}`)).toEqual([
      'The Wood:0',
      'A:1',
    ]);
    expect(store.rows('today', silence).map((r) => r.item.title)).toEqual(['B']);
    expect(store.rows('favorite', silence).map((r) => r.item.title)).toEqual(['Gmail', 'YouTube']);
    // Arc's "Profile 1" becomes its own Orbit profile.
    const work = store.space('arc-S2')!;
    expect(store.profiles.find((p) => p.id === work.profileId)!.name).toBe('Profile 1');
    expect(history.search('github')).toHaveLength(1);
  });

  it('is idempotent: importing again adds nothing', () => {
    const { store, importer } = setup();
    const dir = track(createFakeArcFolder());
    importer.import(dir);
    const before = store.all().length;
    expect(importer.import(dir)).toMatchObject({
      spacesAdded: 0,
      spacesSkipped: 2,
      favoritesAdded: 0,
    });
    expect(store.all().length).toBe(before);
    expect(store.profiles.filter((p) => p.name === 'Profile 1')).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('finds the newest backup first, then Arc’s own folder', () => {
    const home = mkdtempSync(join(tmpdir(), 'orbit-home-'));
    dirs.push(home);
    const older = join(home, 'ArcBackup', '2026-10-30');
    const newer = join(home, 'ArcBackup', '2026-11-01');
    const live = join(home, 'Library', 'Application Support', 'Arc');
    for (const d of [older, newer, live]) {
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'StorableSidebar.json'), '{}');
    }
    mkdirSync(join(home, 'ArcBackup', 'empty'));
    expect(findArcSources(home)).toEqual([newer, older, live]);
  });

  it('maps Arc themes onto Orbit themes', () => {
    expect(toSpaceTheme({ mode: 'light', colors: ['#aabbcc'], noise: 2, intensity: -1 })).toEqual({
      mode: 'light',
      colors: ['#aabbcc'],
      noise: 1,
      intensity: 0,
    });
  });
});
