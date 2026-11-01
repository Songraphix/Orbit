import { createContext, useContext } from 'react';
import type { DragEvent } from 'react';
import type { DropTarget } from '@shared/sidebar-dnd';
import type { SidebarRow } from '@shared/types/space';

export { moveFor } from '@shared/sidebar-dnd';
export type { DropTarget } from '@shared/sidebar-dnd';

/**
 * Sidebar drag and drop (F-04/F-05): reorder, into/out of folders, Pinned ↔ Today, onto the
 * favorites grid. Native HTML drag events; main validates and applies every move.
 */
export const DRAG_TYPE = 'application/x-orbit-item';

export type DndState = {
  dragging: string | null;
  target: DropTarget | null;
  setDragging: (id: string | null) => void;
  setTarget: (target: DropTarget | null) => void;
  /** Applies a drop (main validates; impossible moves are ignored). */
  drop: (itemId: string | null, target: DropTarget) => void;
};

export const DndContext = createContext<DndState>({
  dragging: null,
  target: null,
  setDragging: () => undefined,
  setTarget: () => undefined,
  drop: () => undefined,
});

export const useDnd = () => useContext(DndContext);

/** Where a pointer over a row means to drop: above/below it, or into a folder's middle. */
export function targetForRow(row: SidebarRow, e: DragEvent<HTMLElement>): DropTarget {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  if (row.kind === 'folder' && y > 0.25 && y < 0.75) return { kind: 'into', rowId: row.id };
  return { kind: y < 0.5 ? 'before' : 'after', rowId: row.id };
}

export function readDragged(e: DragEvent): string | null {
  return e.dataTransfer.getData(DRAG_TYPE) || null;
}
