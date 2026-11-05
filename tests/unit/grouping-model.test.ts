import { describe, expect, it } from 'vitest';
import {
  acceptedGroups,
  proposeGroups,
  siteLabel,
  titleWords,
} from '../../src/main/sidebar/grouping-model';

const tab = (id: string, title: string, url: string) => ({ id, title, url });

describe('proposeGroups', () => {
  it('groups by site first, then by words titles share; the rest stay loose', () => {
    const groups = proposeGroups([
      tab('a', 'orbit/src — pull request', 'https://github.com/x/orbit/pull/1'),
      tab('b', 'Issues · orbit', 'https://github.com/x/orbit/issues'),
      tab('c', 'Kyoto temples to visit', 'https://travel.example/kyoto'),
      tab('d', 'Kyoto hotels near Gion', 'https://hotels.example/kyoto'),
      tab('e', 'Recipe: lentil soup', 'https://food.example/soup'),
      tab('f', 'localhost:5173', 'http://localhost:5173/'),
      tab('g', 'Storybook', 'http://127.0.0.1:6006/'),
    ]);
    expect(groups.map((g) => [g.name, g.tabIds, g.reason])).toEqual([
      ['GitHub', ['a', 'b'], 'site'],
      ['Local Development', ['f', 'g'], 'site'],
      ['Kyoto', ['c', 'd'], 'topic'],
    ]);
  });

  it('does nothing for a few tabs, and never puts a tab in two folders', () => {
    expect(proposeGroups([tab('a', 'A', 'https://a.com'), tab('b', 'B', 'https://a.com')])).toEqual(
      [],
    );
    const groups = proposeGroups([
      tab('a', 'Budget planning 2027', 'https://one.example/'),
      tab('b', 'Budget review', 'https://two.example/'),
      tab('c', 'Planning offsite', 'https://three.example/'),
      tab('d', 'Planning lunch', 'https://four.example/'),
    ]);
    const all = groups.flatMap((g) => g.tabIds);
    expect(new Set(all).size).toBe(all.length);
    expect(groups.map((g) => g.name)).toEqual(['Planning']);
  });

  it('skips a site that holds most of the tabs (topics do better)', () => {
    const groups = proposeGroups([
      tab('a', 'Brand colours', 'https://www.figma.com/a'),
      tab('b', 'Brand logo', 'https://www.figma.com/b'),
      tab('c', 'Onboarding flow', 'https://www.figma.com/c'),
      tab('d', 'Onboarding emails', 'https://www.figma.com/d'),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Onboarding', 'Brand']);
  });
});

describe('labels and words', () => {
  it('names sites as people know them', () => {
    expect(siteLabel('github.com')).toBe('GitHub');
    expect(siteLabel('docs.google.com')).toBe('Google Docs');
    expect(siteLabel('news.bbc.co.uk')).toBe('Bbc');
    expect(siteLabel('localhost')).toBe('Local Development');
  });
  it('keeps meaningful title words only', () => {
    expect([...titleWords('The best Kyoto hotels — Booking.com', 'booking.com')]).toEqual([
      'kyoto',
      'hotels',
    ]);
  });
});

describe('acceptedGroups', () => {
  it('keeps only loose tabs, once each; drops thin folders; names stay unique', () => {
    const loose = new Set(['a', 'b', 'c', 'd', 'e']);
    expect(
      acceptedGroups(
        [
          { name: ' Trip ', tabIds: ['a', 'b', 'gone'] },
          { name: 'Trip', tabIds: ['b', 'c', 'd'] },
          { name: 'Solo', tabIds: ['e'] },
        ],
        loose,
      ),
    ).toEqual([
      { name: 'Trip', tabIds: ['a', 'b'] },
      { name: 'Trip 2', tabIds: ['c', 'd'] },
    ]);
  });
});
