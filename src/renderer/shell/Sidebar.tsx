import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import type { DownloadView } from '@shared/types/downloads';
import type { SidebarSnapshot } from '@shared/types/space';
import { DownloadsShelf } from './sidebar/DownloadsShelf';
import { DndContext, moveFor, readDragged } from './sidebar/dnd';
import type { DndState, DropTarget } from './sidebar/dnd';
import { FavoritesGrid } from './sidebar/FavoritesGrid';
import { RowList } from './sidebar/Rows';
import { BottomBar, SpaceHeader } from './sidebar/SpaceParts';

/** Height of the draggable strip that holds the traffic lights (F-01). */
const TITLE_STRIP_HEIGHT = 44;

type Props = {
  width: number;
  sidebar: SidebarSnapshot | null;
  downloads: DownloadView[];
  /** Called when an edge drag starts/ends, so the shell can stand in for the live web view. */
  onResizeStart: () => void;
  onResizeEnd: () => void;
};

/** Which row (or the space name) is being renamed inline. */
function useRenaming() {
  const [renaming, setRenaming] = useState<{ target: 'item' | 'space'; id: string } | null>(null);
  useEffect(() => {
    const offMain = window.orbit.on('rename:start', ({ target, id }) =>
      setRenaming({ target, id }),
    );
    const onRow = (e: Event) =>
      setRenaming({ target: 'item', id: (e as CustomEvent<string>).detail });
    const onSpace = () => setRenaming({ target: 'space', id: '' });
    window.addEventListener('orbit:rename', onRow);
    window.addEventListener('orbit:rename-space', onSpace);
    return () => {
      offMain();
      window.removeEventListener('orbit:rename', onRow);
      window.removeEventListener('orbit:rename-space', onSpace);
    };
  }, []);
  return [renaming, () => setRenaming(null)] as const;
}

/**
 * The sidebar (F-01…F-07, Img 5): favorites grid, pinned tabs and folders, the space header with
 * Clear, "+ New Tab", Today, and the bottom bar with the space switcher.
 */
function useDndState(sidebar: SidebarSnapshot | null): DndState {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  return {
    dragging,
    target,
    setDragging,
    setTarget,
    drop: (itemId, dropTarget) => {
      setDragging(null);
      setTarget(null);
      if (!itemId || !sidebar) return;
      const move = moveFor(dropTarget, sidebar);
      if (move) void window.orbit.invoke('sidebar:move', { itemId, ...move });
    },
  };
}

/** A drop zone (end of a section, or the favorites grid). */
function dropZone(dnd: DndState, target: DropTarget) {
  return {
    onDragOver: (e: DragEvent) => {
      if (!dnd.dragging) return;
      e.preventDefault();
      dnd.setTarget(target);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dnd.drop(readDragged(e) ?? dnd.dragging, target);
    },
  };
}

export function Sidebar({ width, sidebar, downloads, onResizeStart, onResizeEnd }: Props) {
  const [renaming, stopRenaming] = useRenaming();
  const dnd = useDndState(sidebar);
  const isTarget = (t: DropTarget) => JSON.stringify(dnd.target) === JSON.stringify(t);
  const space = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId);
  const renamingItem = renaming?.target === 'item' ? renaming.id : null;

  return (
    <aside
      className="absolute inset-y-0 left-0 flex flex-col"
      style={{ width, color: 'var(--sidebar-fg)' }}
      data-testid="sidebar"
    >
      <div
        className="drag-region shrink-0"
        style={{ height: TITLE_STRIP_HEIGHT }}
        data-testid="title-strip"
      />
      {sidebar && space && (
        <DndContext.Provider value={dnd}>
          <div className="no-drag min-h-0 flex-1 overflow-y-auto pb-2">
            <div
              {...dropZone(dnd, { kind: 'favorites' })}
              className={`rounded-xl ${isTarget({ kind: 'favorites' }) ? 'bg-[var(--hover)] ring-2 ring-[var(--accent)]' : ''} ${
                sidebar.favorites.length === 0 && dnd.dragging ? 'mx-3 mb-2 h-10' : ''
              }`}
              data-testid="favorites-drop"
            >
              <FavoritesGrid rows={sidebar.favorites} activeId={sidebar.activeItemId} />
            </div>
            <nav className="flex flex-col gap-0.5 px-2" aria-label="Tabs">
              <RowList
                rows={sidebar.pinned}
                activeId={sidebar.activeItemId}
                renamingId={renamingItem}
                onRenamed={stopRenaming}
                testId="pinned-list"
              />
              <div
                {...dropZone(dnd, { kind: 'end', section: 'pinned' })}
                className={`h-2 rounded ${isTarget({ kind: 'end', section: 'pinned' }) ? 'bg-[var(--accent)]/60' : ''}`}
                data-testid="pinned-end"
              />
              <SpaceHeader
                space={space}
                renaming={renaming?.target === 'space'}
                onRenamed={stopRenaming}
                hasToday={sidebar.today.length > 0}
              />
              <button
                type="button"
                className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
                onClick={() => void window.orbit.invoke('tabs:create', {})}
                data-testid="new-tab-row"
              >
                <Plus size={16} strokeWidth={2} />
                New Tab
              </button>
              <RowList
                rows={sidebar.today}
                activeId={sidebar.activeItemId}
                renamingId={renamingItem}
                onRenamed={stopRenaming}
                testId="tab-list"
              />
              <div
                {...dropZone(dnd, { kind: 'end', section: 'today' })}
                className={`min-h-8 flex-1 rounded ${isTarget({ kind: 'end', section: 'today' }) ? 'shadow-[inset_0_2px_0_var(--accent)]' : ''}`}
                data-testid="today-end"
              />
            </nav>
          </div>
        </DndContext.Provider>
      )}
      <DownloadsShelf items={downloads} />
      {sidebar && <BottomBar spaces={sidebar.spaces} activeSpaceId={sidebar.activeSpaceId} />}
      <ResizeHandle onStart={onResizeStart} onEnd={onResizeEnd} />
    </aside>
  );
}

/** Drag the sidebar's right edge to resize. Main clamps the width and sends back the layout. */
function ResizeHandle({ onStart, onEnd }: { onStart: () => void; onEnd: () => void }) {
  const frame = useRef<number | null>(null);
  const pending = useRef<number | null>(null);

  const send = () => {
    frame.current = null;
    if (pending.current !== null) {
      void window.orbit.invoke('sidebar:setWidth', { width: pending.current });
      pending.current = null;
    }
  };

  // Document-level listeners rather than pointer capture: hiding the native web view at drag start
  // shifts focus between views, which can cancel pointer capture mid-drag.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onStart();

    const move = (ev: globalThis.PointerEvent) => {
      // Hiding the web view makes Chromium send a hover move at the OS cursor position with no
      // button held; only real drag moves (primary button down) count.
      if ((ev.buttons & 1) === 0) return;
      pending.current = ev.clientX; // the sidebar starts at x = 0, so pointer x is the width
      frame.current ??= requestAnimationFrame(send); // at most one update per frame
    };
    const finish = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      send();
      onEnd();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish); // e.g. ⌘-Tab away mid-drag
  };

  return (
    <div
      className="no-drag absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
      // Hovering the edge snapshots the page, so a drag can swap it in without delay.
      onPointerEnter={() => void window.orbit.invoke('sidebar:prepareResize', {})}
      onPointerDown={onPointerDown}
      data-testid="sidebar-resize-handle"
    />
  );
}
