import { describe, expect, it } from 'vitest';
import { moveFor } from '@shared/sidebar-dnd';
import type { SidebarRow } from '@shared/types/space';

const row = (
  id: string,
  depth = 0,
  parentId: string | null = null,
  kind: 'tab' | 'folder' = 'tab',
): SidebarRow => ({
  id,
  kind,
  section: 'pinned',
  parentId,
  depth,
  title: id,
  url: null,
  favicon: null,
  collapsed: false,
  live: false,
  isLoading: false,
  awayFromHome: false,
  split: false,
  liveFolder: false,
  liveError: null,
  unread: false,
  openIn: 'tab',
});

// Pinned: [a, F(folder) > [f1, f2], b]; Today: [t1, t2]
const rows = {
  pinned: [row('a'), row('F', 0, null, 'folder'), row('f1', 1, 'F'), row('f2', 1, 'F'), row('b')],
  today: [
    { ...row('t1'), section: 'today' as const },
    { ...row('t2'), section: 'today' as const },
  ],
};

describe('moveFor', () => {
  it('drops before a row at its level', () => {
    expect(moveFor({ kind: 'before', rowId: 'f2' }, rows)).toEqual({
      section: 'pinned',
      parentId: 'F',
      beforeId: 'f2',
    });
  });

  it('drops after a row: before its next sibling, skipping a folder’s children', () => {
    expect(moveFor({ kind: 'after', rowId: 'F' }, rows)).toEqual({
      section: 'pinned',
      parentId: null,
      beforeId: 'b',
    });
    expect(moveFor({ kind: 'after', rowId: 'f2' }, rows)).toEqual({
      section: 'pinned',
      parentId: 'F',
      beforeId: null,
    });
    expect(moveFor({ kind: 'after', rowId: 't2' }, rows)).toEqual({
      section: 'today',
      parentId: null,
      beforeId: null,
    });
  });

  it('drops into a folder, at a section’s end, or onto favorites', () => {
    expect(moveFor({ kind: 'into', rowId: 'F' }, rows)).toEqual({
      section: 'pinned',
      parentId: 'F',
      beforeId: null,
    });
    expect(moveFor({ kind: 'end', section: 'today' }, rows)).toEqual({
      section: 'today',
      parentId: null,
      beforeId: null,
    });
    expect(moveFor({ kind: 'favorites' }, rows)).toEqual({
      section: 'favorite',
      parentId: null,
      beforeId: null,
    });
  });

  it('ignores unknown rows', () => {
    expect(moveFor({ kind: 'before', rowId: 'nope' }, rows)).toBeNull();
  });
});
