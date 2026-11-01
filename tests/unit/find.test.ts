import { describe, expect, it, vi } from 'vitest';
import { FindController } from '../../src/main/tabs/find';
import type { Findable } from '../../src/main/tabs/find';
import type { FindState } from '@shared/types/find';

function setup() {
  let nextId = 1;
  const page = {
    findInPage: vi.fn(() => nextId++),
    stopFindInPage: vi.fn(),
    isDestroyed: () => false,
  } satisfies Findable;
  const states: FindState[] = [];
  const find = new FindController(
    () => page,
    (s) => states.push(s),
  );
  return { page, find, last: () => states.at(-1)! };
}

describe('FindController', () => {
  it('opens, searches, and records results for the latest request only', () => {
    const { page, find, last } = setup();
    find.open();
    expect(last()).toMatchObject({ open: true, focusToken: 1 });

    find.search('orbit');
    expect(page.findInPage).toHaveBeenLastCalledWith('orbit', { forward: true, findNext: true });
    find.search('orbits'); // requestId 2
    find.onResult({ requestId: 1, activeMatchOrdinal: 1, matches: 9 }); // stale
    expect(last()).toMatchObject({ matches: 0 });
    find.onResult({ requestId: 2, activeMatchOrdinal: 1, matches: 3 });
    expect(last()).toMatchObject({ query: 'orbits', activeMatch: 1, matches: 3 });
  });

  it('steps through matches with ⌘G / ⇧⌘G', () => {
    const { page, find } = setup();
    find.search('a');
    find.step('next');
    expect(page.findInPage).toHaveBeenLastCalledWith('a', { forward: true, findNext: false });
    find.step('previous');
    expect(page.findInPage).toHaveBeenLastCalledWith('a', { forward: false, findNext: false });
  });

  it('⌘G with nothing searched just opens the bar', () => {
    const { page, find, last } = setup();
    find.step('next');
    expect(page.findInPage).not.toHaveBeenCalled();
    expect(last().open).toBe(true);
  });

  it('clearing the query clears highlights; closing stops finding', () => {
    const { page, find, last } = setup();
    find.search('a');
    find.search('');
    expect(page.stopFindInPage).toHaveBeenCalledWith('clearSelection');
    expect(last()).toMatchObject({ open: true, matches: 0 });
    find.close();
    expect(page.stopFindInPage).toHaveBeenLastCalledWith('keepSelection');
    expect(last().open).toBe(false);
  });
});
