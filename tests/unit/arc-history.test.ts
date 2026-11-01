import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { chromeTimeToMs, readChromiumHistory } from '../../src/main/importer/arc/history';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A tiny History database in Chromium's schema (just the columns we read). */
function fakeHistory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-hist-'));
  dirs.push(dir);
  const file = join(dir, 'History');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER,
           typed_count INTEGER, last_visit_time INTEGER, hidden INTEGER DEFAULT 0)`);
  const insert = db.prepare(
    'INSERT INTO urls (url, title, visit_count, last_visit_time, hidden) VALUES (?, ?, ?, ?, ?)',
  );
  // 2026-11-01T00:00:00Z in Chromium time — too big for a JS number, so BigInt (as real files).
  const t = (BigInt(Date.UTC(2026, 10, 1)) + 11_644_473_600_000n) * 1000n;
  insert.run('https://github.com/', 'GitHub', 12, t, 0);
  insert.run('https://old.example/', null, 1, t - 86_400_000_000n, 0);
  insert.run('chrome://settings/', 'Settings', 3, t, 0);
  insert.run('https://hidden.example/', 'Hidden', 1, t, 1);
  db.close();
  return file;
}

describe('chromeTimeToMs', () => {
  it('converts Chromium microseconds-since-1601 to Unix ms', () => {
    expect(chromeTimeToMs((Date.UTC(2026, 10, 1) + 11_644_473_600_000) * 1000)).toBe(
      Date.UTC(2026, 10, 1),
    );
    expect(chromeTimeToMs(0)).toBe(0);
  });
});

describe('readChromiumHistory', () => {
  it('reads web pages newest first, skipping hidden and internal URLs', () => {
    const visits = readChromiumHistory(fakeHistory());
    expect(visits).toEqual([
      {
        url: 'https://github.com/',
        title: 'GitHub',
        visitCount: 12,
        lastVisitAt: Date.UTC(2026, 10, 1),
      },
      {
        url: 'https://old.example/',
        title: '',
        visitCount: 1,
        lastVisitAt: Date.UTC(2026, 10, 1) - 86_400_000,
      },
    ]);
  });
});
