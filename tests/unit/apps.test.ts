import { describe, expect, it } from 'vitest';
import { appUrl, panelApps, showsIn } from '../../src/shared/apps';
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
