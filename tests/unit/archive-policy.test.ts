import { describe, expect, it } from 'vitest';
import { tabsToArchive, tabsToSleep } from '../../src/main/archive/policy';
import type { TabFacts } from '../../src/main/archive/policy';

const H = 3_600_000;
const now = 100 * H;
const tab = (id: string, extra: Partial<TabFacts> = {}): TabFacts => ({
  id,
  section: 'today',
  lastActiveAt: now,
  live: true,
  isActive: false,
  isAudible: false,
  ...extra,
});

describe('tabsToArchive', () => {
  it('archives Today tabs idle past the threshold', () => {
    const tabs = [
      tab('old', { lastActiveAt: now - 13 * H }),
      tab('fresh', { lastActiveAt: now - H }),
    ];
    expect(tabsToArchive(tabs, now, '12h')).toEqual(['old']);
    expect(tabsToArchive(tabs, now, '24h')).toEqual([]);
    expect(tabsToArchive(tabs, now, 'never')).toEqual([]);
  });

  it('never archives pinned, favorites, the active tab or a playing tab', () => {
    const old = now - 100 * H;
    const tabs = [
      tab('pinned', { section: 'pinned', lastActiveAt: old }),
      tab('fav', { section: 'favorite', lastActiveAt: old }),
      tab('active', { isActive: true, lastActiveAt: old }),
      tab('music', { isAudible: true, lastActiveAt: old }),
      tab('never-shown', { lastActiveAt: null }),
    ];
    expect(tabsToArchive(tabs, now, '12h')).toEqual([]);
  });
});

describe('tabsToSleep', () => {
  const policy = { maxLive: 2, idleMs: 30 * 60_000 };

  it('sleeps idle live tabs', () => {
    const tabs = [
      tab('idle', { lastActiveAt: now - H }),
      tab('recent', { lastActiveAt: now - 60_000 }),
    ];
    expect(tabsToSleep(tabs, now, policy)).toEqual(['idle']);
  });

  it('keeps at most maxLive pages, sleeping the least recently used first', () => {
    const tabs = [
      tab('a', { lastActiveAt: now - 5 * 60_000 }),
      tab('b', { lastActiveAt: now - 4 * 60_000 }),
      tab('c', { lastActiveAt: now - 3 * 60_000 }),
      tab('d', { lastActiveAt: now - 2 * 60_000, isActive: true }),
    ];
    expect(tabsToSleep(tabs, now, policy)).toEqual(['a', 'b']);
  });

  it('never sleeps the active tab, a playing tab or one that is already asleep', () => {
    const old = now - 10 * H;
    const tabs = [
      tab('active', { isActive: true, lastActiveAt: old }),
      tab('music', { isAudible: true, lastActiveAt: old }),
      tab('asleep', { live: false, lastActiveAt: old }),
    ];
    expect(tabsToSleep(tabs, now, policy)).toEqual([]);
  });
});
