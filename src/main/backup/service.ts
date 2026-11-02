import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { readFile, readdir, rm, stat, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from '../persistence/db';
import { DATABASE_FILE } from '../persistence';
import {
  BackupError,
  backupFileName,
  backupsBeyond,
  decryptBackup,
  encryptBackup,
  isEncrypted,
  packBackup,
  unpackBackup,
} from './archive';
import type { BackupFile } from './archive';

const PENDING = 'restore-pending';
const CAPTURES = 'Captures';
const DAY_MS = 86_400_000;

export class NeedsPassphrase extends Error {}

/**
 * Backups (roadmap P4.7): a snapshot of Orbit's data — the database and the screenshots kept
 * for the Library — written as one file to a folder you choose, optionally encrypted. Restoring
 * prepares the backup's files; they take the place of the current ones the next time Orbit
 * starts (the current ones are kept aside, never deleted).
 */
export class BackupService {
  constructor(
    private readonly deps: {
      db: Database;
      userData: string;
      appVersion: string;
      /** The passphrase for encrypted backups, if one is set (Keychain). */
      passphrase: () => string | null;
    },
  ) {}

  /** Writes a backup to `file`. Returns its size in bytes. */
  async backupTo(file: string, now = Date.now()): Promise<number> {
    const { userData } = this.deps;
    const snapshot = join(userData, `backup-snapshot-${now}.db`);
    if (existsSync(snapshot)) rmSync(snapshot);
    try {
      // A consistent copy of the live database (WAL included), without stopping Orbit.
      this.deps.db.prepare('VACUUM INTO ?').run(snapshot);
      const files: BackupFile[] = [{ path: DATABASE_FILE, data: await readFile(snapshot) }];
      const captures = join(userData, CAPTURES);
      if (existsSync(captures)) {
        for (const name of await readdir(captures)) {
          const path = join(captures, name);
          if ((await stat(path)).isFile() && !name.startsWith('.')) {
            files.push({ path: `${CAPTURES}/${name}`, data: await readFile(path) });
          }
        }
      }
      let data = packBackup(files, this.deps.appVersion, now);
      const passphrase = this.deps.passphrase();
      if (passphrase) data = encryptBackup(data, passphrase);
      // Written beside, then moved into place: a half-written backup never has the real name.
      const partial = `${file}.partial`;
      await writeFile(partial, data, { mode: 0o600 });
      await rename(partial, file);
      return data.length;
    } finally {
      await rm(snapshot, { force: true });
    }
  }

  /** A daily backup into `folder` if the last one is a day old, keeping the newest `keep`. */
  async autoBackup(folder: string, keep: number, last: number | null, now = Date.now()) {
    if (last !== null && now - last < DAY_MS) return null;
    mkdirSync(folder, { recursive: true });
    const file = join(folder, backupFileName(now));
    await this.backupTo(file, now);
    for (const old of backupsBeyond(readdirSync(folder), keep)) {
      rmSync(join(folder, old), { force: true });
    }
    return file;
  }

  /**
   * Reads a backup and stages its files for the next start. Throws NeedsPassphrase when it's
   * encrypted and no (or the wrong) passphrase was given, or BackupError when it can't be used.
   */
  async prepareRestore(file: string, passphrase?: string): Promise<{ createdAt: number }> {
    let data: Buffer = await readFile(file);
    if (isEncrypted(data)) {
      const tries = [passphrase, this.deps.passphrase()].filter((p): p is string => !!p);
      let opened: Buffer | null = null;
      for (const attempt of tries) {
        try {
          opened = decryptBackup(data, attempt);
          break;
        } catch {
          // try the next one
        }
      }
      if (!opened) {
        throw new NeedsPassphrase(
          passphrase ? 'That passphrase doesn’t open this backup' : 'This backup is encrypted',
        );
      }
      data = opened;
    }
    const { manifest, files } = unpackBackup(data);
    if (!files.some((f) => f.path === DATABASE_FILE)) {
      throw new BackupError('This backup has no Orbit data in it');
    }
    const pending = join(this.deps.userData, PENDING);
    rmSync(pending, { recursive: true, force: true });
    mkdirSync(join(pending, CAPTURES), { recursive: true });
    for (const f of files) await writeFile(join(pending, f.path), f.data);
    return { createdAt: manifest.createdAt };
  }

  /** Throws away a staged restore (changed your mind before restarting). */
  cancelRestore(): void {
    rmSync(join(this.deps.userData, PENDING), { recursive: true, force: true });
  }
}

/**
 * At launch, before the database opens: a staged restore takes the current data's place. The
 * current files move to `before-restore/<time>` (never deleted). Returns true if it restored.
 */
export function applyPendingRestore(userData: string, now = Date.now()): boolean {
  const pending = join(userData, PENDING);
  const restored = join(pending, DATABASE_FILE);
  if (!existsSync(restored)) return false;
  const aside = join(userData, 'before-restore', String(now));
  mkdirSync(aside, { recursive: true });
  for (const name of [DATABASE_FILE, `${DATABASE_FILE}-wal`, `${DATABASE_FILE}-shm`]) {
    const current = join(userData, name);
    if (existsSync(current)) renameSync(current, join(aside, name));
  }
  renameSync(restored, join(userData, DATABASE_FILE));
  const captures = join(userData, CAPTURES);
  const pendingCaptures = join(pending, CAPTURES);
  if (existsSync(pendingCaptures) && readdirSync(pendingCaptures).length > 0) {
    if (existsSync(captures)) renameSync(captures, join(aside, CAPTURES));
    renameSync(pendingCaptures, captures);
  }
  rmSync(pending, { recursive: true, force: true });
  return statSync(join(userData, DATABASE_FILE)).isFile();
}
