import { basename, extname, join } from 'node:path';

/**
 * Pure download helpers (F-10).
 */

/** A safe file name: no path separators or control characters, never empty. */
export function safeFileName(name: string): string {
  const cleaned = basename(name.replace(/\\/g, '/'))
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f:]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || 'download';
}

/** "report.pdf" → "report (1).pdf" → "report (2).pdf"… whichever doesn't exist yet. */
export function uniquePath(
  dir: string,
  fileName: string,
  exists: (path: string) => boolean,
): string {
  const name = safeFileName(fileName);
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  let candidate = join(dir, name);
  for (let i = 1; exists(candidate); i++) candidate = join(dir, `${stem} (${i})${ext}`);
  return candidate;
}

/** The shelf shows downloads that are running, or finished within the last hour, until dismissed. */
export const SHELF_WINDOW_MS = 60 * 60_000;

export function onShelf(
  d: { state: string; startedAt: number; finishedAt: number | null; dismissed: boolean },
  now: number,
): boolean {
  if (d.dismissed) return false;
  if (d.state === 'progressing') return true;
  return now - (d.finishedAt ?? d.startedAt) < SHELF_WINDOW_MS;
}
