import { afterEach, describe, expect, it } from 'vitest';
import { buildFtsQuery, historyScore, isRecordable } from '../../src/main/history/model';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { HistoryRepository } from '../../src/main/persistence/repositories/history';

describe('buildFtsQuery', () => {
  it('turns words into quoted prefix terms', () => {
    expect(buildFtsQuery('git hub')).toBe('"git"* "hub"*');
  });
  it('splits URLs into searchable parts and strips FTS syntax', () => {
    expect(buildFtsQuery('mail.google.com/inbox')).toBe('"mail"* "google"* "com"* "inbox"*');
    expect(buildFtsQuery('a"b* (c)')).toBe('"ab"* "c"*');
  });
  it('returns null when nothing searchable remains', () => {
    expect(buildFtsQuery('  ///  ')).toBeNull();
  });
});

describe('isRecordable', () => {
  it('records web pages only', () => {
    expect(isRecordable('https://a.com/')).toBe(true);
    expect(isRecordable('orbit://newtab')).toBe(false);
    expect(isRecordable('about:blank')).toBe(false);
  });
});

describe('historyScore', () => {
  const now = Date.UTC(2026, 10, 1);
  it('prefers recent, frequent and domain-prefix matches', () => {
    const base = { url: 'https://example.com/', visitCount: 1, lastVisitAt: now, bm25: -1 };
    const old = { ...base, lastVisitAt: now - 60 * 86_400_000 };
    const frequent = { ...base, visitCount: 50 };
    expect(historyScore(base, 'x', now)).toBeGreaterThan(historyScore(old, 'x', now));
    expect(historyScore(frequent, 'x', now)).toBeGreaterThan(historyScore(base, 'x', now));
    expect(historyScore(base, 'exa', now)).toBeGreaterThan(historyScore(base, 'x', now));
  });
});

describe('HistoryRepository', () => {
  let db: Database;
  afterEach(() => db?.close());
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new HistoryRepository(db);
  };
  const now = Date.UTC(2026, 10, 1);

  it('records visits, counts repeats and keeps the latest title', () => {
    const h = repo();
    h.recordVisit('https://github.com/', 'GitHub', now - 1000);
    h.recordVisit('https://github.com/', '', now);
    const [entry] = h.search('git', 8, now);
    expect(entry).toMatchObject({
      url: 'https://github.com/',
      title: 'GitHub',
      visitCount: 2,
      lastVisitAt: now,
    });
  });

  it('searches titles and URLs by prefix, and keeps the index in sync with title updates', () => {
    const h = repo();
    h.recordVisit('https://mail.google.com/mail/u/0/', '', now);
    h.updateTitle('https://mail.google.com/mail/u/0/', 'Inbox (3) – Gmail');
    h.recordVisit('https://www.youtube.com/watch?v=1', 'Heavenly Worship R&B', now);
    expect(h.search('gma', 8, now).map((e) => e.url)).toEqual([
      'https://mail.google.com/mail/u/0/',
    ]);
    expect(h.search('heav wor', 8, now).map((e) => e.title)).toEqual(['Heavenly Worship R&B']);
    expect(h.search('youtube', 8, now)).toHaveLength(1);
    expect(h.search('nothing-like-this', 8, now)).toEqual([]);
  });

  it('ignores internal pages', () => {
    const h = repo();
    h.recordVisit('orbit://newtab', 'New Tab', now);
    expect(h.topSites()).toEqual([]);
  });

  it('attaches favicons by host', () => {
    const h = repo();
    h.recordVisit('https://github.com/a', 'A', now);
    h.setFavicon('https://github.com/b', 'data:image/png;base64,AA==');
    expect(h.search('github', 8, now)[0]!.favicon).toBe('data:image/png;base64,AA==');
  });

  it('imports bulk history without lowering existing counts', () => {
    const h = repo();
    h.recordVisit('https://a.com/', 'A', now);
    const n = h.importVisits([
      { url: 'https://a.com/', title: 'A', visitCount: 5, lastVisitAt: now - 10 },
      { url: 'https://b.com/', title: 'B', visitCount: 2, lastVisitAt: now - 10 },
      { url: 'chrome://settings', title: 'x', visitCount: 1, lastVisitAt: now },
    ]);
    expect(n).toBe(2);
    expect(h.topSites().map((e) => [e.url, e.visitCount])).toEqual([
      ['https://a.com/', 5],
      ['https://b.com/', 2],
    ]);
  });

  it('clears history', () => {
    const h = repo();
    h.recordVisit('https://a.com/', 'A', now);
    h.clear();
    expect(h.search('a', 8, now)).toEqual([]);
  });
});
