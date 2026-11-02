import { describe, expect, it } from 'vitest';
import { backgroundKey, DEFAULT_LOOK, lookFilter, rotate, withUtm } from '@shared/backgrounds';
import { wallpaperChoiceSchema } from '@shared/types/newtab';

describe('Homepage backgrounds', () => {
  it('keys each kind of background (favourites, "is this the current one")', () => {
    expect(backgroundKey({ kind: 'builtin', id: 'aurora' })).toBe('builtin:aurora');
    expect(backgroundKey({ kind: 'color', color: '#ABCDEF' })).toBe('color:#abcdef');
    expect(backgroundKey({ kind: 'gradient', from: '#000000', to: '#FFFFFF', angle: 90 })).toBe(
      'gradient:#000000:#ffffff:90',
    );
    expect(backgroundKey({ kind: 'unsplash', photo: { id: 'x1' } })).toBe('unsplash:x1');
  });

  it('a stored choice from before still reads; bad colours don’t', () => {
    expect(wallpaperChoiceSchema.parse({ kind: 'builtin', id: 'dune' })).toEqual({
      kind: 'builtin',
      id: 'dune',
    });
    expect(() => wallpaperChoiceSchema.parse({ kind: 'color', color: 'red' })).toThrow();
  });

  it('rotates: the same all day, a different one each tab, nothing when off', () => {
    const pool = ['a', 'b', 'c'];
    const day1 = rotate(pool, 'daily', '2026-11-02', null)!;
    expect(rotate(pool, 'daily', '2026-11-02', 2)!.pick).toBe(day1.pick);
    expect(rotate(pool, 'daily', '2026-11-03', null)!.pick).not.toBe(day1.pick);
    expect(rotate(pool, 'off', '2026-11-02', null)).toBeNull();
    expect(rotate([], 'daily', '2026-11-02', null)).toBeNull();
    // Every tab: never the same twice in a row.
    expect(rotate(pool, 'every-tab', '2026-11-02', 1, () => 0.4)!.index).toBe(2);
    expect(rotate(['only'], 'every-tab', '2026-11-02', 0, () => 0)!.pick).toBe('only');
  });

  it('turns adjustments into a CSS filter (none when untouched)', () => {
    expect(lookFilter(DEFAULT_LOOK)).toBe('none');
    expect(lookFilter({ ...DEFAULT_LOOK, brightness: 80, blur: 6 })).toBe(
      'brightness(80%) blur(6px)',
    );
  });

  it('adds Unsplash’s referral parameters to credit links', () => {
    expect(withUtm('https://unsplash.com/@ama')).toBe(
      'https://unsplash.com/@ama?utm_source=orbit_browser&utm_medium=referral',
    );
    expect(withUtm('https://unsplash.com/x?a=1')).toContain('?a=1&utm_source=');
  });
});
