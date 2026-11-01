import { describe, expect, it } from 'vitest';
import { relativeTime } from '@shared/time';
import { onShelf, safeFileName, uniquePath } from '../../src/main/downloads/model';

describe('download helpers', () => {
  it('cleans file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\evil\\file.txt')).toBe('file.txt');
    expect(safeFileName('...hidden')).toBe('hidden');
    expect(safeFileName('a\u0000b:c.pdf')).toBe('abc.pdf');
    expect(safeFileName('')).toBe('download');
  });

  it('never overwrites: adds (1), (2)…', () => {
    const taken = new Set(['/d/report.pdf', '/d/report (1).pdf', '/d/notes']);
    expect(uniquePath('/d', 'report.pdf', (p) => taken.has(p))).toBe('/d/report (2).pdf');
    expect(uniquePath('/d', 'notes', (p) => taken.has(p))).toBe('/d/notes (1)');
    expect(uniquePath('/d', 'new.txt', (p) => taken.has(p))).toBe('/d/new.txt');
  });

  it('keeps running and recent downloads on the shelf until dismissed', () => {
    const now = 10 * 3_600_000;
    const base = { startedAt: now - 2 * 3_600_000, finishedAt: null, dismissed: false };
    expect(onShelf({ ...base, state: 'progressing' }, now)).toBe(true);
    expect(onShelf({ ...base, state: 'completed', finishedAt: now - 10 * 60_000 }, now)).toBe(true);
    expect(onShelf({ ...base, state: 'completed', finishedAt: now - 2 * 3_600_000 }, now)).toBe(
      false,
    );
    expect(onShelf({ ...base, state: 'progressing', dismissed: true }, now)).toBe(false);
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000_000;
  it('reads like Arc’s shelf', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 27 * 60_000, now)).toBe('27 minutes ago');
    expect(relativeTime(now - 60_000, now)).toBe('1 minute ago');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 hours ago');
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe('yesterday');
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe('4 days ago');
  });
});
