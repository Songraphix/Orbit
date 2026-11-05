import { Cloud, Home, PanelLeft, Plus } from 'lucide-react';
import type { Rect } from '@shared/types/layout';
import { NEW_TAB_URL } from '@shared/types/tabs';
import { OrbitMenuButton } from './Toolbar';
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
import { BottomBar, SpaceHeader, SpaceRow } from './sidebar/SpaceParts';
import { LibraryNav } from './sidebar/LibraryNav';
import { Tip } from '../tooltip/Tip';
import { WorkspaceNav } from './sidebar/WorkspaceNav';
import { FocusChip } from './sidebar/FocusChip';
import type { TabState } from '@shared/types/tabs';
import type { LibrarySection } from '@shared/types/library';

/** Height of the draggable strip that holds the traffic lights (F-01). */
const TITLE_STRIP_HEIGHT = 44;

type Props = {
  /** Where the island sits in the window (the slid-out copy fills its own strip instead). */
  rect?: Rect;
  width: number;
  sidebar: SidebarSnapshot | null;
  downloads: DownloadView[];
  media: MediaState;
  /** Library mode (F-11): the sidebar lists the Library's sections instead of tabs. */
  librarySection: LibrarySection | null;
  /** Drawn by the overlay as the hidden sidebar slid out over the page (no resize edge). */
  floating?: boolean;
  /** UI 2: pinned apps as a grid in the sidebar, which runs the full height (traffic lights and
   *  the Orbit menu at its top). */
  grid?: boolean;
  /** The page on screen (its row, or New Tab when it's the Homepage, is lit). */
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
  rect,
  width,
  sidebar,
  downloads,
  media,
  librarySection,
  floating = false,
  grid = false,
  activeTab,
  onResizeStart,
  onResizeEnd,
}: Props) {
  const [renaming, stopRenaming] = useRenaming();
  const dnd = useDndState(sidebar);
  const isTarget = (t: DropTarget) => JSON.stringify(dnd.target) === JSON.stringify(t);
  const space = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId);
  const renamingItem = renaming?.target === 'item' ? renaming.id : null;
  // The top holds the traffic lights (UI 2, the slid-out copy) or starts right away (UI 1).
  const titled = grid || floating;
  const home = activeTab?.url === NEW_TAB_URL;

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
      className={`flex flex-col overflow-hidden ${
        librarySection ? 'absolute' : 'mat-deep absolute rounded-[22px]'
      }`}
      style={
        rect
          ? {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              color: 'var(--fg)',
            }
          : { left: 0, top: 0, bottom: 0, width, color: 'var(--fg)' }
      }
      onContextMenu={(e) => {
        if (e.defaultPrevented || librarySection) return;
        if ((e.target as HTMLElement).closest('input, textarea')) return;
        e.preventDefault();
        void window.orbit.invoke('sidebar:backgroundMenu', {});
      }}
      data-testid="sidebar"
      data-grid={grid}
    >
      {(titled || librarySection) && (
        <div
          className="drag-region relative shrink-0"
          style={{ height: librarySection ? TITLE_STRIP_HEIGHT : 42 }}
          data-testid="title-strip"
        >
          {/* Beside the traffic lights: hide the sidebar (⌘S), or keep the slid-out one. */}
          {!librarySection && (
            <Tip label={floating ? 'Keep Sidebar Open' : 'Hide Sidebar'} keys="⌘S">
              <button
                type="button"
                aria-label={floating ? 'Keep Sidebar Open' : 'Hide Sidebar'}
                onClick={() => void window.orbit.invoke('sidebar:toggle', {})}
                className="no-drag absolute top-[8px] right-2.5 grid size-7 place-items-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)]"
                data-testid="sidebar-toggle"
              >
                <PanelLeft size={16} />
              </button>
            </Tip>
          )}
        </div>
      )}
      {grid && (
        <div className="no-drag shrink-0 px-2.5 pb-2">
          <OrbitMenuButton />
        </div>
      )}
      {librarySection && <LibraryNav section={librarySection} />}
      {!librarySection && sidebar && space && (
        <DndContext.Provider value={dnd}>
          <div
            className={`no-drag scrollbar-none flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-2 pb-2 ${titled ? '' : 'pt-2.5'}`}
          >
            <button
              type="button"
              aria-current={home ? 'page' : undefined}
              onClick={() => {
                if (!home) void window.orbit.invoke('tabs:create', {});
              }}
              className={`press flex h-10 shrink-0 items-center gap-2.5 rounded-[14px] px-2.5 text-left text-[13.5px] font-medium ${
                home ? 'mat-sel' : 'mat-hover text-[var(--fg)]'
              }`}
              data-testid="home-row"
            >
              <Home size={17} strokeWidth={2} />
              New Tab
            </button>
            {(grid || floating) && (
              <div
                {...dropZone(dnd, { kind: 'favorites' })}
                className={`mt-2 rounded-xl ${isTarget({ kind: 'favorites' }) ? 'bg-[var(--glass-hover)] ring-2 ring-[var(--focus-ring)]' : ''} ${
                  sidebar.favorites.length === 0 && dnd.dragging ? 'h-10' : ''
                }`}
                data-testid="favorites-drop"
              >
                <FavoritesGrid
                  rows={sidebar.favorites}
                  activeId={sidebar.activeItemId}
                  width={width}
                />
              </div>
            )}
            <div className="mt-2">
              <WorkspaceNav />
            </div>
            <div className="flex items-center gap-2.5 px-2.5 pt-1 pb-1.5 text-[13.5px] text-[var(--fg-muted)]">
              <Cloud size={17} strokeWidth={1.9} />
              <span className="font-medium">Spaces</span>
            </div>
            <nav
              key={space.id}
              className={`flex flex-col gap-0.5 ${
                spaceMotion.dir === 'next'
                  ? 'animate-space-next'
                  : spaceMotion.dir === 'prev'
                    ? 'animate-space-prev'
                    : ''
              }`}
              aria-label="Spaces and tabs"
            >
              {sidebar.spaces.map((s, i) =>
                s.id !== space.id ? (
                  <SpaceRow key={s.id} space={s} index={i} />
                ) : (
                  <div
                    key={s.id}
                    className="mat-light flex flex-col gap-0.5 rounded-[16px] p-1"
                    data-testid="active-space"
                  >
                    <SpaceHeader
                      space={space}
                      renaming={renaming?.target === 'space'}
                      onRenamed={stopRenaming}
                      hasToday={sidebar.today.length > 0}
                      tidy={sidebar.tidy}
                    />
                    <RowList
                      rows={sidebar.pinned}
                      activeId={sidebar.activeItemId}
                      renamingId={renamingItem}
                      onRenamed={stopRenaming}
                      testId="pinned-list"
                    />
                    <div
                      {...dropZone(dnd, { kind: 'end', section: 'pinned' })}
                      className={`h-1.5 rounded ${isTarget({ kind: 'end', section: 'pinned' }) ? 'bg-[var(--fg)]/60' : ''}`}
                      data-testid="pinned-end"
                    />
                    <button
                      type="button"
                      className="press flex h-[var(--row-h,34px)] items-center gap-2.5 rounded-[12px] px-2 text-left text-[13px] text-[var(--fg-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)]"
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
                      className={`min-h-4 rounded ${isTarget({ kind: 'end', section: 'today' }) ? 'shadow-[inset_0_2px_0_var(--fg)]' : ''}`}
                      data-testid="today-end"
                    />
                  </div>
                ),
              )}
              <button
                type="button"
                className="press mt-0.5 flex h-9 items-center gap-2.5 rounded-[12px] px-2.5 text-left text-[13px] text-[var(--fg-muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--fg)]"
                onClick={() => void window.orbit.invoke('orbitmenu:run', { action: 'new-space' })}
                data-testid="add-space"
              >
                <Plus size={16} strokeWidth={2} />
                Add Space
              </button>
            </nav>
          </div>
        </DndContext.Provider>
      )}
      {!librarySection && media && <MediaCard media={media} />}
      {!librarySection && <DownloadsShelf items={downloads} />}
      {!librarySection && <FocusChip />}
      {!librarySection && sidebar && <BottomBar />}
      {!floating && rect && (
        <ResizeHandle left={rect.x} onStart={onResizeStart} onEnd={onResizeEnd} />
      )}
    </aside>
  );
}

/** Drag the sidebar's right edge to resize. Main clamps the width and sends back the layout. */
function ResizeHandle({
  left,
  onStart,
  onEnd,
}: {
  left: number;
  onStart: () => void;
  onEnd: () => void;
}) {
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
      pending.current = ev.clientX - left; // the pointer's distance from the island's left edge
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
      className="no-drag absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize"
      // Hovering the edge snapshots the page, so a drag can swap it in without delay.
      onPointerEnter={() => void window.orbit.invoke('sidebar:prepareResize', {})}
      onPointerDown={onPointerDown}
      data-testid="sidebar-resize-handle"
    />
  );
}
