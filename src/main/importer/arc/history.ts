import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Chromium stores times as microseconds since 1601-01-01 UTC. */
const WINDOWS_TO_UNIX_EPOCH_MS = 11_644_473_600_000;

export function chromeTimeToMs(microsSince1601: number): number {
  if (!Number.isFinite(microsSince1601) || microsSince1601 <= 0) return 0;
  return Math.round(microsSince1601 / 1000 - WINDOWS_TO_UNIX_EPOCH_MS);
}

export type ImportedVisit = { url: string; title: string; visitCount: number; lastVisitAt: number };

/**
 * Reads Arc's (Chromium's) History database (F-27). Always from a temporary copy, never the
 * original, so a running browser's file is never locked or modified.
 */
export function readChromiumHistory(historyFile: string, limit = 100_000): ImportedVisit[] {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-import-'));
  try {
    const copy = join(dir, 'History');
    copyFileSync(historyFile, copy);
    const db = new DatabaseSync(copy, { readOnly: true });
    try {
      const rows = db
        .prepare(
          // Chromium times (~1.3e16 µs) exceed JavaScript's safe integers, so convert to Unix
          // milliseconds inside SQLite (integer maths), where the values fit comfortably.
          `SELECT url, title, visit_count AS visitCount,
                  MAX(0, last_visit_time / 1000 - ${WINDOWS_TO_UNIX_EPOCH_MS}) AS lastVisitAt
             FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ?`,
        )
        .all(limit) as {
        url: string;
        title: string | null;
        visitCount: number;
        lastVisitAt: number;
      }[];
      return rows
        .filter((r) => /^https?:\/\//i.test(r.url))
        .map((r) => ({
          url: r.url,
          title: r.title ?? '',
          visitCount: r.visitCount,
          lastVisitAt: r.lastVisitAt,
        }));
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
