import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { applyPendingRestore, BackupService, NeedsPassphrase } from '../../src/main/backup/service';

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-backup-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(passphrase: string | null = null) {
  const userData = temp();
  const db = openDatabase(join(userData, 'orbit.db'));
  migrate(db, migrations);
  db.prepare("INSERT INTO settings (key, value) VALUES ('marker', '\"before\"')").run();
  mkdirSync(join(userData, 'Captures'));
  writeFileSync(join(userData, 'Captures', 'shot.png'), Buffer.from([1, 2, 3]));
  const service = new BackupService({
    db,
    userData,
    appVersion: '0.1.0',
    passphrase: () => passphrase,
  });
  return { userData, db, service };
}

const marker = (dir: string) => {
  const db = openDatabase(join(dir, 'orbit.db'));
  const row = db.prepare("SELECT value FROM settings WHERE key = 'marker'").get() as
    { value: string } | undefined;
  db.close();
  return row?.value ?? null;
};

describe('backups end to end', () => {
  it('backs up, restores at the next launch, and keeps the replaced data aside', async () => {
    const { userData, db, service } = setup();
    const file = join(temp(), 'b.orbitbackup');
    expect(await service.backupTo(file)).toBeGreaterThan(0);
    // Things change after the backup…
    db.prepare("UPDATE settings SET value = '\"after\"' WHERE key = 'marker'").run();
    // …then the backup is restored: staged now, applied at the next start.
    await service.prepareRestore(file);
    db.close();
    expect(applyPendingRestore(userData, 42)).toBe(true);
    expect(marker(userData)).toBe('"before"');
    expect(existsSync(join(userData, 'Captures', 'shot.png'))).toBe(true);
    expect(readdirSync(join(userData, 'before-restore', '42'))).toContain('orbit.db');
    expect(applyPendingRestore(userData)).toBe(false); // nothing staged any more
  });

  it('encrypts with the passphrase and asks for it when restoring elsewhere', async () => {
    const { service, db } = setup('open sesame');
    const file = join(temp(), 'e.orbitbackup');
    await service.backupTo(file);
    db.close();
    const other = setup(null);
    await expect(other.service.prepareRestore(file)).rejects.toBeInstanceOf(NeedsPassphrase);
    await expect(other.service.prepareRestore(file, 'nope')).rejects.toThrow('doesn’t open');
    await expect(other.service.prepareRestore(file, 'open sesame')).resolves.toMatchObject({
      createdAt: expect.any(Number),
    });
    other.db.close();
  });

  it('keeps a daily backup in a folder, newest few only', async () => {
    const { service, db } = setup();
    const folder = join(temp(), 'Backups');
    const day = 86_400_000;
    const start = new Date(2026, 10, 1, 9).getTime();
    expect(await service.autoBackup(folder, 2, null, start)).not.toBeNull();
    expect(await service.autoBackup(folder, 2, start, start + 1000)).toBeNull(); // not due
    await service.autoBackup(folder, 2, start, start + day);
    await service.autoBackup(folder, 2, start + day, start + 2 * day);
    expect(readdirSync(folder).sort()).toEqual([
      'Orbit Backup 2026-11-02 09.00.orbitbackup',
      'Orbit Backup 2026-11-03 09.00.orbitbackup',
    ]);
    db.close();
  });
});
