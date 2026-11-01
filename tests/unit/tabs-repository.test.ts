import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { TabsRepository } from '../../src/main/persistence/repositories/tabs';
import type { SavedTab } from '../../src/main/persistence/repositories/tabs';

let db: Database;
afterEach(() => db?.close());

function repo() {
  db = openDatabase(':memory:');
  migrate(db, migrations);
  return new TabsRepository(db);
}

const tab = (id: string, extra: Partial<SavedTab> = {}): SavedTab => ({
  id,
  url: `https://${id}.com/`,
  title: id.toUpperCase(),
  favicon: null,
  isActive: false,
  ...extra,
});

describe('TabsRepository', () => {
  it('is empty on a fresh database', () => {
    expect(repo().load()).toEqual([]);
  });

  it('round-trips tabs in order with the active flag', () => {
    const r = repo();
    const tabs = [
      tab('c'),
      tab('a', { isActive: true, favicon: 'data:image/png;base64,AA==' }),
      tab('b'),
    ];
    r.saveAll(tabs);
    expect(r.load()).toEqual(tabs);
  });

  it('replaces the previous list on each save', () => {
    const r = repo();
    r.saveAll([tab('a'), tab('b')]);
    r.saveAll([tab('b')]);
    expect(r.load().map((t) => t.id)).toEqual(['b']);
    r.saveAll([]);
    expect(r.load()).toEqual([]);
  });

  it('drops oversized favicons rather than bloating the database', () => {
    const r = repo();
    r.saveAll([tab('a', { favicon: `data:image/png;base64,${'A'.repeat(70_000)}` })]);
    expect(r.load()[0]!.favicon).toBeNull();
  });
});
