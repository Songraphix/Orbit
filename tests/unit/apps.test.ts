import { describe, expect, it } from 'vitest';
import {
  appUrl,
  panelAppShowsIn,
  panelApps,
  showsIn,
  spacesLabel,
  toggleSpace,
} from '../../src/shared/apps';
import type { OpenIn } from '../../src/shared/apps';

const row = (id: string, openIn: OpenIn, kind: 'tab' | 'folder' = 'tab') => ({ id, kind, openIn });

describe('panelApps', () => {
  it('lists the favourites that open in the panel, in sidebar order', () => {
    const rows = [
      row('a', 'panel'),
      row('b', 'tab'),
      row('folder', 'panel', 'folder'),
      row('c', 'window'),
      row('d', 'panel'),
    ];
    expect(panelApps(rows).map((r) => r.id)).toEqual(['a', 'd']);
    expect(panelApps([])).toEqual([]);
  });
});

describe('showsIn', () => {
  it('shows everywhere without a choice, else only in the chosen Spaces', () => {
    expect(showsIn(undefined, 's1')).toBe(true);
    expect(showsIn({ openIn: 'tab', spaces: null }, 's1')).toBe(true);
    expect(showsIn({ openIn: 'tab', spaces: ['s1', 's2'] }, 's2')).toBe(true);
    expect(showsIn({ openIn: 'tab', spaces: ['s1'] }, 's2')).toBe(false);
  });
});

describe('appUrl', () => {
  it('turns typed addresses into web addresses, and refuses anything else', () => {
    expect(appUrl('notion.so')).toBe('https://notion.so/');
    expect(appUrl(' https://docs.google.com/document ')).toBe('https://docs.google.com/document');
    expect(appUrl('not an address')).toBeNull();
    expect(appUrl('localhost')).toBeNull();
    expect(appUrl('file:///etc/passwd')).toBeNull();
    expect(appUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('toggleSpace', () => {
  const all = ['work', 'home', 'study'];
  it('from Every Space, ticking one means only that one', () => {
    expect(toggleSpace(null, 'home', all)).toEqual(['home']);
  });
  it('adds and removes, in the Spaces’ order; never unticks the last', () => {
    expect(toggleSpace(['study'], 'work', all)).toEqual(['work', 'study']);
    expect(toggleSpace(['work', 'study'], 'work', all)).toEqual(['study']);
    expect(toggleSpace(['study'], 'study', all)).toEqual(['study']);
    // All ticked stays a list: Spaces made later don't get it (unlike Every Space).
    expect(toggleSpace(['work', 'home'], 'study', all)).toEqual(['work', 'home', 'study']);
  });
  it('drops Spaces that no longer exist', () => {
    expect(toggleSpace(['gone', 'work'], 'home', all)).toEqual(['work', 'home']);
  });
});

describe('spacesLabel', () => {
  const all = [
    { id: 'w', name: 'Work' },
    { id: 'h', name: 'Home' },
    { id: 's', name: 'Study' },
  ];
  it('names one or two Spaces, counts more', () => {
    expect(spacesLabel(null, all)).toBe('In every Space');
    expect(spacesLabel(['h'], all)).toBe('Only in Home');
    expect(spacesLabel(['w', 'h'], all)).toBe('In Work and Home');
    expect(spacesLabel(['w', 'h', 's'], all)).toBe('In 3 Spaces');
    expect(spacesLabel(['gone'], all)).toBe('In no Space');
  });
});

describe('panelAppShowsIn', () => {
  const work = { id: 'w', profileId: 'p1' };
  it('stays open in Spaces of its profile that show it', () => {
    expect(panelAppShowsIn({ profileId: 'p1', data: null }, work)).toBe(true);
    expect(panelAppShowsIn({ profileId: 'p2', data: null }, work)).toBe(false);
    const onlyHome = {
      profileId: 'p1',
      data: { app: { openIn: 'panel' as const, spaces: ['h'] } },
    };
    expect(panelAppShowsIn(onlyHome, work)).toBe(false);
    expect(panelAppShowsIn(onlyHome, { id: 'h', profileId: 'p1' })).toBe(true);
  });
});
