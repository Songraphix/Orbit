import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { backupDatabase, backupDue, backupsToPrune } from '../../src/main/persistence/backup';
import { openDatabase } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const day = (d: string) => Date.parse(`${d}T12:00:00Z`);

describe('backup policy', () => {
  it('is due with no backups, or when the newest is a day old', () => {
    expect(backupDue([], day('2026-11-01'))).toBe(true);
    expect(backupDue(['orbit-2026-11-01.db'], day('2026-11-01'))).toBe(false);
    expect(backupDue(['orbit-2026-10-31.db', 'notes.txt'], day('2026-11-01'))).toBe(true);
  });

  it('keeps the newest seven', () => {
    const files = Array.from(
      { length: 9 },
      (_, i) => `orbit-2026-10-${String(20 + i).padStart(2, '0')}.db`,
    );
    expect(backupsToPrune([...files, 'other.txt'])).toEqual([
      'orbit-2026-10-21.db',
      'orbit-2026-10-20.db',
    ]);
  });
});

describe('backupDatabase', () => {
  it('writes a readable snapshot once a day and prunes old ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orbit-backup-'));
    dirs.push(dir);
    const db = openDatabase(join(dir, 'orbit.db'));
    migrate(db, migrations);
    db.prepare("INSERT INTO settings (key, value) VALUES ('k', '\"v\"')").run();
    const backups = join(dir, 'backups');
    for (let i = 0; i < 8; i++) {
      // pre-existing old backups (content doesn't matter for pruning)
      if (i === 0) backupDatabase(db, backups, day('2026-10-01'));
      else writeFileSync(join(backups, `orbit-2026-10-0${i + 1}.db`), '');
    }

    const made = backupDatabase(db, backups, day('2026-11-01'));
    expect(made).toBe(join(backups, 'orbit-2026-11-01.db'));
    expect(backupDatabase(db, backups, day('2026-11-01'))).toBeNull(); // not again today
    expect(readdirSync(backups).sort()).toHaveLength(7);

    const copy = new DatabaseSync(made!, { readOnly: true });
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'k'").get()).toEqual({
      value: '"v"',
    });
    copy.close();
    db.close();
  });
});
