import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { ArchiveRepository } from '../../src/main/persistence/repositories/archive';

let db: Database | undefined;
afterEach(() => {
  if (db?.isOpen) db.close();
});
function repo() {
  db = openDatabase(':memory:');
  migrate(db, migrations);
  return new ArchiveRepository(db);
}
const entry = (title: string, archivedAt: number) => ({
  spaceId: 's1',
  profileId: 'default',
  url: `https://${title.toLowerCase().replace(/\s+/g, '-')}.com/`,
  title,
  favicon: null,
  reason: 'closed' as const,
  archivedAt,
});

describe('ArchiveRepository', () => {
  it('lists newest first and searches titles and URLs', () => {
    const a = repo();
    a.add(entry('Heavenly Worship', 1));
    a.add(entry('GitHub Pull Request', 2));
    expect(a.list().map((e) => e.title)).toEqual(['GitHub Pull Request', 'Heavenly Worship']);
    expect(a.list('heav').map((e) => e.title)).toEqual(['Heavenly Worship']);
    expect(a.list('github').map((e) => e.title)).toEqual(['GitHub Pull Request']);
  });

  it('takeLatest pops the most recent entry (⇧⌘T)', () => {
    const a = repo();
    a.add(entry('First', 1));
    a.add(entry('Second', 2));
    expect(a.takeLatest()!.title).toBe('Second');
    expect(a.takeLatest()!.title).toBe('First');
    expect(a.takeLatest()).toBeNull();
  });

  it('removes entries (restored tabs leave the archive) and prunes the oldest', () => {
    const a = repo();
    const kept = a.add(entry('Keep', 3));
    a.add(entry('Old', 1));
    a.add(entry('Older', 0));
    a.prune(2);
    expect(a.list().map((e) => e.title)).toEqual(['Keep', 'Old']);
    a.remove(kept.id);
    expect(a.list('keep')).toEqual([]);
  });
});
