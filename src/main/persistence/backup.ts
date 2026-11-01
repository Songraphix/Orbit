import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './db';

/** Backups are named by UTC date: orbit-2026-11-01.db */
const NAME = /^orbit-(\d{4}-\d{2}-\d{2})\.db$/;
const DAY_MS = 86_400_000;

export function backupName(now: number): string {
  return `orbit-${new Date(now).toISOString().slice(0, 10)}.db`;
}

/** Due when there's no backup from the last 24 hours. Pure. */
export function backupDue(files: readonly string[], now: number): boolean {
  const newest = files
    .map((f) => NAME.exec(f)?.[1])
    .filter((d): d is string => d !== undefined)
    .map((d) => Date.parse(`${d}T00:00:00Z`))
    .sort((a, b) => b - a)[0];
  return newest === undefined || now - newest >= DAY_MS;
}

/** The backups beyond the newest `keep`, to delete. Pure. */
export function backupsToPrune(files: readonly string[], keep = 7): string[] {
  return files
    .filter((f) => NAME.test(f))
    .sort()
    .reverse()
    .slice(keep);
}

/**
 * Daily database backup (PLAN.md section 5.3): on launch, if the newest backup is a day old,
 * write a consistent snapshot with `VACUUM INTO` and keep the last seven.
 * Returns the new backup's path, or null if none was due.
 */
export function backupDatabase(
  db: Database,
  dir: string,
  now = Date.now(),
  keep = 7,
): string | null {
  mkdirSync(dir, { recursive: true });
  const files = readdirSync(dir);
  if (!backupDue(files, now)) return null;
  const target = join(dir, backupName(now));
  if (existsSync(target)) rmSync(target); // VACUUM INTO refuses to overwrite
  db.prepare('VACUUM INTO ?').run(target);
  for (const old of backupsToPrune([...files, backupName(now)], keep)) {
    rmSync(join(dir, old), { force: true });
  }
  return target;
}
