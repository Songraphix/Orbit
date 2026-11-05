import { ArrowDown, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { DRAG_TYPE, readDragged } from './sidebar/dnd';
import { OrbitMenuButton, Tools } from './Toolbar';
import type { ToolsProps } from './Toolbar';
import type { DownloadView } from '@shared/types/downloads';
import type { MouseEvent } from 'react';
import type { Rect } from '@shared/types/layout';
import type { SidebarRow, SidebarSnapshot } from '@shared/types/space';
import { TabIcon } from './sidebar/Rows';
import { SpaceIcon } from './sidebar/SpaceIcon';
import { Tip } from '../tooltip/Tip';

const invoke = window.orbit.invoke;
const activate = (row: SidebarRow) => void invoke('tabs:activate', { tabId: row.id });
const menu = (e: MouseEvent, row: SidebarRow) => {
  e.preventDefault();
  void invoke('sidebar:itemMenu', { itemId: row.id });
};

/**
 * Tabs on top (UI spec §6, layout B, UI 3): the Space's tabs as floating pills across the top —
 * favicon, title and close; the active one a little raised in the canvas's accent glass. The
 * same tabs as the sidebar (one tab model): pinned tabs first as icon pills, then Today's. Drag
 * to reorder; the row scrolls sideways (wheel or trackpad) when there are many; ⌘-number and
 * ⌃Tab work as always. The Orbit menu sits before them and Orbit's tools after.
 */
export function TabStrip({
  rect,
  sidebar,
  downloads,
  tools,
}: {
  rect: Rect;
  sidebar: SidebarSnapshot;
  downloads: DownloadView[];
  tools: ToolsProps;
}) {
  const pinned = sidebar.pinned.filter((r) => r.kind === 'tab');
  // Every tab, folders' too (dragging reorders top-level tabs; tabs in folders stay in them).
  const today = sidebar.today.filter((r) => r.kind === 'tab');
  const scroller = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const active = sidebar.activeItemId;

  // Keep the active pill in view (a ⌘-number or ⌃Tab to a tab scrolled away).
  useEffect(() => {
    scroller.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const drop = (e: DragEvent, row: SidebarRow, section: 'pinned' | 'today', list: SidebarRow[]) => {
    e.preventDefault();
    const itemId = readDragged(e);
    const after = over?.id === row.id && over.after;
    setOver(null);
    if (!itemId || itemId === row.id) return;
    const index = list.findIndex((r) => r.id === row.id);
    const beforeId = after ? (list[index + 1]?.id ?? null) : row.id;
    void invoke('sidebar:move', { itemId, section, parentId: null, beforeId });
  };
  const dragProps = (row: SidebarRow, section: 'pinned' | 'today', list: SidebarRow[]) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, row.id);
      e.dataTransfer.effectAllowed = 'move' as const;
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      setOver({ id: row.id, after: e.clientX > r.left + r.width / 2 });
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => drop(e, row, section, list),
  });
  const marker = (row: SidebarRow) =>
    over?.id === row.id ? (
      <span
        className={`pointer-events-none absolute inset-y-1.5 w-0.5 rounded-full bg-[var(--fg)] ${over.after ? '-right-1' : '-left-1'}`}
      />
    ) : null;

  return (
    <div
      className="drag-region absolute flex items-center gap-2 pr-2.5 pl-[84px] text-[var(--fg)]"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onContextMenu={(e) => {
        // Tabs, apps and text fields have their own menus.
        if (e.defaultPrevented || (e.target as HTMLElement).closest('input, textarea')) return;
        e.preventDefault();
        void invoke('toolbar:menu', {});
      }}
      data-testid="tab-strip"
    >
      <OrbitMenuButton />
      {sidebar.spaces.length > 1 && (
        <div className="no-drag mat-light flex h-9 shrink-0 items-center gap-0.5 rounded-full px-1">
          {sidebar.spaces.map((space, i) => (
            <Tip key={space.id} label={space.name} keys={i < 9 ? `⌃${i + 1}` : undefined}>
              <button
                type="button"
                aria-label={space.name}
                aria-current={space.id === sidebar.activeSpaceId ? 'true' : undefined}
                onClick={() => void invoke('spaces:activate', { spaceId: space.id })}
                className={`press grid size-7 place-items-center rounded-full ${
                  space.id === sidebar.activeSpaceId
                    ? 'mat-sel'
                    : 'opacity-60 hover:bg-[var(--glass-hover)] hover:opacity-100'
                }`}
                data-testid="strip-space"
              >
                <SpaceIcon icon={space.icon} size={14} />
              </button>
            </Tip>
          ))}
        </div>
      )}
      <div
        ref={scroller}
        className="scrollbar-none flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-0.5 py-2"
        onWheel={(e) => {
          // A mouse wheel scrolls the row sideways.
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
        role="tablist"
        aria-label="Tabs"
      >
        {pinned.map((row) => (
          <Tip key={row.id} label={row.title}>
            <button
              type="button"
              role="tab"
              aria-label={row.title}
              aria-selected={row.id === active}
              onClick={() => activate(row)}
              onContextMenu={(e) => menu(e, row)}
              className={`press no-drag relative grid h-9 w-11 shrink-0 place-items-center rounded-full ${
                row.id === active ? 'mat-sel' : `mat-light ${row.live ? '' : 'opacity-70'}`
              }`}
              data-testid="strip-pinned"
              {...dragProps(row, 'pinned', pinned)}
            >
              {marker(row)}
              <TabIcon row={row} />
            </button>
          </Tip>
        ))}
        {today.map((row) => {
          const on = row.id === active;
          return (
            <div
              key={row.id}
              role="tab"
              tabIndex={0}
              aria-selected={on}
              title={row.title}
              onClick={() => activate(row)}
              onKeyDown={(e) => e.key === 'Enter' && activate(row)}
              onAuxClick={(e) => e.button === 1 && void invoke('tabs:close', { tabId: row.id })}
              onContextMenu={(e) => menu(e, row)}
              className={`press no-drag group relative flex h-9 w-[200px] min-w-[120px] shrink cursor-default items-center gap-2 rounded-full pr-1.5 pl-3 text-[13.5px] transition-[background,box-shadow] duration-[var(--dur-hover)] ${
                on
                  ? 'mat-sel font-medium'
                  : 'mat-light text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
              data-testid="strip-tab"
              {...(row.depth === 0 ? dragProps(row, 'today', today) : {})}
            >
              {marker(row)}
              <span className="grid size-4 shrink-0 place-items-center [&>*]:size-4">
                <TabIcon row={row} />
              </span>
              <span className="min-w-0 flex-1 truncate">{row.title}</span>
              <button
                type="button"
                aria-label={`Close ${row.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void invoke('tabs:close', { tabId: row.id });
                }}
                className={`grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--glass-hover)] focus-visible:opacity-100 ${
                  on ? '' : 'opacity-0 group-hover:opacity-100'
                }`}
                data-testid="strip-close"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>
          );
        })}
        <Tip label="New Tab" keys="⌘T">
          <button
            type="button"
            aria-label="New Tab"
            onClick={() => void invoke('tabs:create', {})}
            className="press no-drag mat-light grid size-9 shrink-0 place-items-center rounded-full text-[var(--icon)] hover:text-[var(--fg)]"
            data-testid="strip-new-tab"
          >
            <Plus size={17} />
          </button>
        </Tip>
      </div>
      <DownloadsButton downloads={downloads} />
      <Tools {...tools} />
    </div>
  );
}

const RING = 2 * Math.PI * 12;

/** With no sidebar shelf, downloads land here: a ring fills while they run; click for the
 *  Library's Downloads. The flying badge (F-10) docks into it. */
function DownloadsButton({ downloads }: { downloads: DownloadView[] }) {
  const running = downloads.filter((d) => d.state === 'progressing');
  const total = running.reduce((n, d) => n + d.totalBytes, 0);
  const received = running.reduce((n, d) => n + d.receivedBytes, 0);
  const progress = running.length > 0 ? (total > 0 ? received / total : 0.1) : null;
  return (
    <Tip label={running.length > 0 ? `Downloading ${running.length}…` : 'Downloads'}>
      <button
        type="button"
        aria-label="Downloads"
        onClick={() => void invoke('library:open', { section: 'downloads' })}
        className="press no-drag mat-light relative grid size-9 shrink-0 place-items-center rounded-full text-[var(--icon)] hover:text-[var(--fg)]"
        data-testid="strip-downloads"
      >
        {progress !== null && (
          <svg viewBox="0 0 28 28" className="absolute inset-0.5 -rotate-90" aria-hidden>
            <circle
              cx="14"
              cy="14"
              r="12"
              fill="none"
              stroke="#0a84ff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
        )}
        <ArrowDown size={15} className={progress !== null ? 'text-[#0a84ff]' : ''} />
      </button>
    </Tip>
  );
}
