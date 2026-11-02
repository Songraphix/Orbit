import { describe, expect, it } from 'vitest';
import {
  duplicateTabs,
  fromBeforeToday,
  pageKey,
  sortToday,
} from '../../src/main/sidebar/tidy-model';
import type { TodayTab } from '../../src/main/sidebar/tidy-model';

const tab = (id: string, url: string, lastActiveAt: number | null, title = id): TodayTab => ({
  id,
  url,
  title,
  lastActiveAt,
  createdAt: 0,
});

describe('tab housekeeping', () => {
  it('treats #fragments and trailing slashes as the same page', () => {
    expect(pageKey('https://a.dev/docs/#intro')).toBe(pageKey('https://a.dev/docs'));
    expect(pageKey('https://a.dev/')).toBe('https://a.dev/');
  });

  it('closes duplicates, keeping pinned pages and the most recently used copy', () => {
    const today = [
      tab('a1', 'https://a.dev/x', 10),
      tab('a2', 'https://a.dev/x#y', 30),
      tab('b', 'https://b.dev/', 5),
      tab('p', 'https://pinned.dev/', 50),
    ];
    expect(duplicateTabs(today, ['https://pinned.dev/'])).toEqual(['a1', 'p']);
  });

  it('sorts Today by site, title or recency', () => {
    const today = [
      tab('z', 'https://zeta.dev/a', 1, 'Beta'),
      tab('a2', 'https://www.alpha.dev/b', 3, 'Second'),
      tab('a1', 'https://alpha.dev/a', 2, 'First'),
    ];
    expect(sortToday(today, 'site')).toEqual(['a1', 'a2', 'z']);
    expect(sortToday(today, 'title')).toEqual(['z', 'a1', 'a2']);
    expect(sortToday(today, 'recent')).toEqual(['a2', 'a1', 'z']);
  });

  it('finds tabs from before today, never the one on screen', () => {
    const now = new Date(2026, 10, 2, 15, 0).getTime();
    const yesterday = new Date(2026, 10, 1, 20, 0).getTime();
    const morning = new Date(2026, 10, 2, 9, 0).getTime();
    const tabs = [
      tab('old', 'https://a.dev', yesterday),
      tab('new', 'https://b.dev', morning),
      tab('active', 'https://c.dev', yesterday),
    ];
    expect(fromBeforeToday(tabs, now, 'active')).toEqual(['old']);
  });
});
