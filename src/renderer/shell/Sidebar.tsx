import { PanelLeft, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import type { DownloadView } from '@shared/types/downloads';
import type { SidebarSnapshot } from '@shared/types/space';
import { DownloadsShelf } from './sidebar/DownloadsShelf';
import { MediaCard } from './sidebar/MediaCard';
import type { MediaState } from '@shared/types/media';
import { DndContext, moveFor, readDragged } from './sidebar/dnd';
import type { DndState, DropTarget } from './sidebar/dnd';
import { FavoritesGrid } from './sidebar/FavoritesGrid';
import { RowList } from './sidebar/Rows';
import { BottomBar, SpaceHeader } from './sidebar/SpaceParts';
import { LibraryNav } from './sidebar/LibraryNav';
import { Tip } from '../tooltip/Tip';
import { WorkspaceNav } from './sidebar/WorkspaceNav';
import { FocusChip } from './sidebar/FocusChip';
import { AddressPill } from './sidebar/AddressPill';
import type { TabState } from '@shared/types/tabs';
import type { LibrarySection } from '@shared/types/library';

/** Height of the draggable strip that holds the traffic lights (F-01). */
const TITLE_STRIP_HEIGHT = 44;

type Props = {
  width: number;
  sidebar: SidebarSnapshot | null;
  downloads: DownloadView[];
  media: MediaState;
  /** Library mode (F-11): the sidebar lists the Library's sections instead of tabs. */
  librarySection: LibrarySection | null;
  /** Drawn by the overlay as the hidden sidebar slid out over the page (no resize edge). */
  floating?: boolean;
  /** The page on screen, for the address pill (Arc). */
  activeTab: TabState | null;
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

export function Sidebar({
  width,
  sidebar,
  downloads,
  media,
  librarySection,
  floating = false,
  activeTab,
  onResizeStart,
  onResizeEnd,
}: Props) {
  const [renaming, stopRenaming] = useRenaming();
  const dnd = useDndState(sidebar);
  const isTarget = (t: DropTarget) => JSON.stringify(dnd.target) === JSON.stringify(t);
  const space = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId);
  const renamingItem = renaming?.target === 'item' ? renaming.id : null;

  // Switching spaces slides the list the way you moved (next space: from the right).
  const [spaceMotion, setSpaceMotion] = useState<{
    id: string | null;
    dir: 'next' | 'prev' | null;
  }>({ id: null, dir: null });
  const activeSpaceId = sidebar?.activeSpaceId ?? null;
  if (activeSpaceId !== spaceMotion.id) {
    const ids = sidebar?.spaces.map((s) => s.id) ?? [];
    const dir =
      spaceMotion.id === null || activeSpaceId === null
        ? null
        : ids.indexOf(activeSpaceId) > ids.indexOf(spaceMotion.id)
          ? 'next'
          : 'prev';
    setSpaceMotion({ id: activeSpaceId, dir });
  }

  return (
    <aside
      className="absolute inset-y-0 left-0 flex flex-col"
      style={{ width, color: 'var(--sidebar-fg)' }}
      // Right-click on empty space (rows, tiles and the space header have their own menus, and
      // text fields keep the text menu): Arc's sidebar menu.
      onContextMenu={(e) => {
        if (e.defaultPrevented || librarySection) return;
        if ((e.target as HTMLElement).closest('input, textarea')) return;
        e.preventDefault();
        void window.orbit.invoke('sidebar:backgroundMenu', {});
      }}
      data-testid="sidebar"
    >
      <div
        className="drag-region relative shrink-0"
        style={{ height: TITLE_STRIP_HEIGHT }}
        data-testid="title-strip"
      >
        {/* Beside the traffic lights, like Arc: hide the sidebar (⌘S), or pin it back. The
            Library's narrow column has no room for it. */}
        {!librarySection && (
          <Tip label={floating ? 'Keep Sidebar Open' : 'Hide Sidebar'} keys="⌘S">
            <button
              type="button"
              aria-label={floating ? 'Keep Sidebar Open' : 'Hide Sidebar'}
              onClick={() => void window.orbit.invoke('sidebar:toggle', {})}
              className="no-drag absolute top-[11px] left-[78px] grid size-6 place-items-center rounded-md text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
              data-testid="sidebar-toggle"
            >
              <PanelLeft size={15} />
            </button>
          </Tip>
        )}
      </div>
      {!librarySection && <AddressPill tab={activeTab} />}
      {librarySection && <LibraryNav section={librarySection} />}
      {!librarySection && sidebar && space && (
        <DndContext.Provider value={dnd}>
          <div
            key={space.id}
            className={`no-drag scrollbar-none min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2 ${
              spaceMotion.dir === 'next'
                ? 'animate-space-next'
                : spaceMotion.dir === 'prev'
                  ? 'animate-space-prev'
                  : ''
            }`}
          >
            <div
              {...dropZone(dnd, { kind: 'favorites' })}
              className={`rounded-xl ${isTarget({ kind: 'favorites' }) ? 'bg-[var(--hover)] ring-2 ring-[var(--accent)]' : ''} ${
                sidebar.favorites.length === 0 && dnd.dragging ? 'mx-3 mb-2 h-10' : ''
              }`}
              data-testid="favorites-drop"
            >
              <FavoritesGrid
                rows={sidebar.favorites}
                activeId={sidebar.activeItemId}
                width={width}
              />
            </div>
            <WorkspaceNav />
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
                tidy={sidebar.tidy}
              />
              <button
                type="button"
                className="press flex h-[34px] items-center gap-2.5 rounded-[12px] px-2 text-left text-[13px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
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
      {!librarySection && media && <MediaCard media={media} />}
      {!librarySection && <DownloadsShelf items={downloads} />}
      {!librarySection && <FocusChip />}
      {!librarySection && sidebar && (
        <BottomBar spaces={sidebar.spaces} activeSpaceId={sidebar.activeSpaceId} />
      )}
      {!floating && <ResizeHandle onStart={onResizeStart} onEnd={onResizeEnd} />}
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
