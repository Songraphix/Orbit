import type { SidebarRow } from './types/space';

/** Where a dragged sidebar item is dropped (pure; used by the shell and tests). */
export type DropTarget =
  | { kind: 'before'; rowId: string }
  | { kind: 'after'; rowId: string }
  | { kind: 'into'; rowId: string }
  | { kind: 'end'; section: 'pinned' | 'today' }
  | { kind: 'favorites' };

/**
 * Turns a drop target into the move main understands. Rows are the flattened, visible list of
 * one section; "after" means before the next sibling under the same parent (or at its end).
 */
export function moveFor(
  target: DropTarget,
  rows: { pinned: SidebarRow[]; today: SidebarRow[] },
): {
  section: 'favorite' | 'pinned' | 'today';
  parentId: string | null;
  beforeId: string | null;
} | null {
  if (target.kind === 'favorites') return { section: 'favorite', parentId: null, beforeId: null };
  if (target.kind === 'end') return { section: target.section, parentId: null, beforeId: null };

  const section = rows.pinned.some((r) => r.id === target.rowId) ? 'pinned' : 'today';
  const list = rows[section];
  const index = list.findIndex((r) => r.id === target.rowId);
  const row = list[index];
  if (!row) return null;

  if (target.kind === 'into') return { section, parentId: row.id, beforeId: null };
  if (target.kind === 'before') return { section, parentId: row.parentId, beforeId: row.id };

  // "after": the next row at the same level, skipping this row's own children.
  const next = list.slice(index + 1).find((r) => r.depth <= row.depth);
  const beforeId = next && next.parentId === row.parentId ? next.id : null;
  return { section, parentId: row.parentId, beforeId };
}
