import { describe, expect, it } from 'vitest';
import { insertAfter, nextActiveAfterClose } from '../../src/main/tabs/model';

describe('nextActiveAfterClose', () => {
  const ids = ['a', 'b', 'c'];

  it('keeps the active tab when closing a different one', () => {
    expect(nextActiveAfterClose(ids, 'a', 'b')).toBe('b');
  });

  it('moves to the tab below when closing the active tab', () => {
    expect(nextActiveAfterClose(ids, 'b', 'b')).toBe('c');
  });

  it('moves to the tab above when closing the last tab', () => {
    expect(nextActiveAfterClose(ids, 'c', 'c')).toBe('b');
  });

  it('returns null when closing the only tab', () => {
    expect(nextActiveAfterClose(['a'], 'a', 'a')).toBeNull();
  });

  it('ignores unknown ids', () => {
    expect(nextActiveAfterClose(ids, 'zzz', 'zzz')).toBe('zzz');
  });
});

describe('insertAfter', () => {
  it('inserts right after the given tab', () => {
    expect(insertAfter(['a', 'b', 'c'], 'x', 'a')).toEqual(['a', 'x', 'b', 'c']);
  });

  it('appends when no anchor is given or it is missing', () => {
    expect(insertAfter(['a'], 'x')).toEqual(['a', 'x']);
    expect(insertAfter(['a'], 'x', 'nope')).toEqual(['a', 'x']);
  });
});
