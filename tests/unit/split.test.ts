import { describe, expect, it } from 'vitest';
import {
  inSplit,
  makeSplit,
  partnerOf,
  splitAfterActivate,
  swapped,
  withRatio,
} from '../../src/main/tabs/split';

describe('split view model', () => {
  const split = makeSplit('a', 'b')!;

  it('needs two different tabs', () => {
    expect(makeSplit('a', 'a')).toBeNull();
    expect(split).toEqual({ ids: ['a', 'b'], ratio: 0.5 });
  });

  it('knows each pane’s partner', () => {
    expect(partnerOf(split, 'a')).toBe('b');
    expect(partnerOf(split, 'b')).toBe('a');
    expect(partnerOf(split, 'c')).toBeNull();
    expect(partnerOf(null, 'a')).toBeNull();
    expect(inSplit(split, 'b')).toBe(true);
    expect(inSplit(split, null)).toBe(false);
  });

  it('keeps the split when a pane is activated, ends it for any other tab', () => {
    expect(splitAfterActivate(split, 'b')).toBe(split);
    expect(splitAfterActivate(split, 'c')).toBeNull();
    expect(splitAfterActivate(null, 'a')).toBeNull();
  });

  it('clamps the ratio and swaps panes', () => {
    expect(withRatio(split, 0.95).ratio).toBe(0.8);
    expect(withRatio(split, Number.NaN).ratio).toBe(0.5);
    expect(swapped(withRatio(split, 0.3))).toEqual({ ids: ['b', 'a'], ratio: 0.7 });
  });
});
