import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, transaction } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { getSchemaVersion, migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { openPersistence } from '../../src/main/persistence';
import { SettingsRepository } from '../../src/main/persistence/repositories/settings';

const open: Database[] = [];
const dirs: string[] = [];

function memoryDb(): Database {
  const db = openDatabase(':memory:');
  open.push(db);
  return db;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-unit-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies all migrations to a fresh database and records the version', () => {
    const db = memoryDb();
    expect(migrate(db, migrations)).toEqual(migrations.map((m) => m.version));
    expect(getSchemaVersion(db)).toBe(migrations.length);
  });

  it('is idempotent: a second run applies nothing', () => {
    const db = memoryDb();
    migrate(db, migrations);
    expect(migrate(db, migrations)).toEqual([]);
  });

  it('applies only migrations newer than the current version', () => {
    const db = memoryDb();
    const list = [
      { version: 1, name: 'a', sql: 'CREATE TABLE a (id INTEGER);' },
      { version: 2, name: 'b', sql: 'CREATE TABLE b (id INTEGER);' },
    ];
    migrate(db, list.slice(0, 1));
    expect(migrate(db, list)).toEqual([2]);
    expect(getSchemaVersion(db)).toBe(2);
  });

  it('rolls back a failing migration and leaves the version unchanged', () => {
    const db = memoryDb();
    const list = [
      { version: 1, name: 'ok', sql: 'CREATE TABLE ok (id INTEGER);' },
      { version: 2, name: 'bad', sql: 'CREATE TABLE half (id INTEGER); NOT VALID SQL;' },
    ];
    expect(() => migrate(db, list)).toThrow();
    expect(getSchemaVersion(db)).toBe(1);
    const half = db.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get();
    expect(half).toBeUndefined();
  });

  it('refuses a database from a newer build', () => {
    const db = memoryDb();
    db.exec('PRAGMA user_version = 99;');
    expect(() => migrate(db, migrations)).toThrow('newer than this build');
  });

  it('rejects gaps or misordering in the migration list', () => {
    const db = memoryDb();
    expect(() => migrate(db, [{ version: 2, name: 'x', sql: '' }])).toThrow('numbered 1..n');
  });
});

describe('transaction', () => {
  it('commits on success and rolls back on error', () => {
    const db = memoryDb();
    db.exec('CREATE TABLE t (v INTEGER);');
    transaction(db, () => db.exec('INSERT INTO t VALUES (1);'));
    expect(() =>
      transaction(db, () => {
        db.exec('INSERT INTO t VALUES (2);');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.prepare('SELECT v FROM t').all()).toEqual([{ v: 1 }]);
  });
});

describe('SettingsRepository', () => {
  function repo() {
    const db = memoryDb();
    migrate(db, migrations);
    return { db, settings: new SettingsRepository(db) };
  }

  it('returns defaults when nothing is stored', () => {
    const { settings } = repo();
    expect(settings.get('sidebar.width')).toBe(260);
    expect(settings.get('sidebar.visible')).toBe(true);
    expect(settings.get('window.state')).toEqual({ bounds: null, isMaximized: false });
  });

  it('round-trips values and overwrites existing keys', () => {
    const { settings } = repo();
    const state = { bounds: { x: 10, y: 20, width: 1200, height: 800 }, isMaximized: true };
    settings.set('window.state', state);
    settings.set('sidebar.width', 300);
    settings.set('sidebar.width', 320);
    expect(settings.get('window.state')).toEqual(state);
    expect(settings.get('sidebar.width')).toBe(320);
  });

  it('rejects invalid values on write', () => {
    const { settings } = repo();
    expect(() => settings.set('sidebar.width', 50)).toThrow();
  });

  it('falls back to the default for corrupt or out-of-range stored values', () => {
    const { db, settings } = repo();
    const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    put.run('sidebar.width', '9000');
    put.run('sidebar.visible', '{not json');
    expect(settings.get('sidebar.width')).toBe(260);
    expect(settings.get('sidebar.visible')).toBe(true);
  });
});

describe('openPersistence', () => {
  it('creates orbit.db in WAL mode, migrates it, and persists across reopen', () => {
    const dir = tempDir();
    const first = openPersistence(dir);
    const mode = first.db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    expect(mode.journal_mode).toBe('wal');
    first.settings.set('sidebar.visible', false);
    first.close();

    const second = openPersistence(dir);
    expect(getSchemaVersion(second.db)).toBe(migrations.length);
    expect(second.settings.get('sidebar.visible')).toBe(false);
    second.close();
  });
});

describe('transaction', () => {
  it('nests as a savepoint: the inner part rolls back alone, the outer still commits', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE t (v INTEGER)');
    transaction(db, () => {
      db.prepare('INSERT INTO t VALUES (1)').run();
      expect(() =>
        transaction(db, () => {
          db.prepare('INSERT INTO t VALUES (2)').run();
          throw new Error('inner fails');
        }),
      ).toThrow('inner fails');
      transaction(db, () => db.prepare('INSERT INTO t VALUES (3)').run());
    });
    const values = (db.prepare('SELECT v FROM t ORDER BY v').all() as { v: number }[]).map(
      (r) => r.v,
    );
    expect(values).toEqual([1, 3]);
    expect((db as { isTransaction?: boolean }).isTransaction).toBe(false);
  });
});
