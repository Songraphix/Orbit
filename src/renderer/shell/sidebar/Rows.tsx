import {
  ChevronRight,
  CornerUpLeft,
  Folder,
  Globe,
  PenTool,
  Rss,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import type { SidebarRow } from '@shared/types/space';
import { DRAG_TYPE, readDragged, targetForRow, useDnd } from './dnd';

const INDENT_PX = 14;

/** Drag handlers and the drop indicator for one row. */
function useRowDnd(row: SidebarRow) {
  const dnd = useDnd();
  const target =
    dnd.target && 'rowId' in dnd.target && dnd.target.rowId === row.id ? dnd.target : null;
  const indicator =
    target?.kind === 'before'
      ? 'shadow-[inset_0_2px_0_var(--accent)]'
      : target?.kind === 'after'
        ? 'shadow-[inset_0_-2px_0_var(--accent)]'
        : target?.kind === 'into'
          ? 'ring-2 ring-[var(--accent)]'
          : '';
  const props = {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(DRAG_TYPE, row.id);
      e.dataTransfer.effectAllowed = 'move';
      dnd.setDragging(row.id);
    },
    onDragEnd: () => {
      dnd.setDragging(null);
      dnd.setTarget(null);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!dnd.dragging || dnd.dragging === row.id) return;
      e.preventDefault();
      e.stopPropagation();
      dnd.setTarget(targetForRow(row, e));
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dnd.drop(readDragged(e) ?? dnd.dragging, targetForRow(row, e));
    },
  };
  return { props, indicator, isDragging: dnd.dragging === row.id };
}

const invoke = window.orbit.invoke;

/** Inline rename field (double-click, or "Rename…" from the right-click menu). */
export function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <input
      ref={input}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value);
        if (e.key === 'Escape') onDone(null);
      }}
      className="min-w-0 flex-1 rounded bg-white/15 px-1 text-[13px] outline-none ring-1 ring-[var(--accent)]"
      data-testid="rename-input"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function TabIcon({ row }: { row: SidebarRow }) {
  const className = `size-4 shrink-0 ${row.isLoading ? 'animate-pulse' : ''}`;
  if (row.url?.startsWith('orbit://easel/'))
    return <PenTool className={className} strokeWidth={1.75} />;
  if (row.url?.startsWith('orbit://boost/'))
    return <Wand2 className={className} strokeWidth={1.75} />;
  if (row.url?.startsWith('orbit://')) return <Sparkles className={className} strokeWidth={1.75} />;
  if (row.favicon) return <img src={row.favicon} alt="" className={`${className} rounded-sm`} />;
  return <Globe className={`${className} opacity-60`} strokeWidth={1.75} />;
}

/** A tab in the Pinned or Today list (F-04). */
export function TabRow({
  row,
  active,
  renaming,
  onRenamed,
}: {
  row: SidebarRow;
  active: boolean;
  renaming: boolean;
  onRenamed: () => void;
}) {
  const close = (e: MouseEvent) => {
    e.stopPropagation();
    void invoke('tabs:close', { tabId: row.id });
  };
  const unloaded = row.section !== 'today' && !row.live;
  const dnd = useRowDnd(row);

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={active ? 'page' : undefined}
        {...dnd.props}
        className={`press animate-row-in group flex h-[34px] items-center gap-2.5 rounded-[12px] pr-1 text-[13px] ${
          active
            ? 'bg-[var(--row-active)] font-medium shadow-[var(--row-shadow)]'
            : 'hover:bg-[var(--hover)]'
        } ${dnd.indicator} ${dnd.isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: 8 + row.depth * INDENT_PX }}
        onClick={() => void invoke('tabs:activate', { tabId: row.id })}
        onKeyDown={(e) => e.key === 'Enter' && void invoke('tabs:activate', { tabId: row.id })}
        onAuxClick={(e) => e.button === 1 && close(e)} // middle-click closes (F-04)
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('sidebar:itemMenu', { itemId: row.id });
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('orbit:rename', { detail: row.id }));
        }}
        data-testid="tab-row"
        data-section={row.section}
        data-tab-id={row.id}
        data-live={row.live}
      >
        <TabIcon row={row} />
        {renaming ? (
          <RenameInput
            initial={row.title}
            onDone={(value) => {
              if (value !== null) void invoke('sidebar:rename', { itemId: row.id, title: value });
              onRenamed();
            }}
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate ${unloaded ? 'opacity-55' : ''}`}
            title={row.title}
          >
            {row.title}
          </span>
        )}
        {row.unread && (
          // A Live Folder item nobody has opened yet (F-28).
          <span
            className="size-2 shrink-0 rounded-full bg-[var(--accent)]"
            aria-label="New"
            data-testid="unread-dot"
          />
        )}
        {row.awayFromHome && (
          <button
            type="button"
            aria-label="Back to pinned URL"
            title="Back to pinned URL"
            className="grid size-5 shrink-0 place-items-center rounded opacity-60 hover:bg-white/10 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              void invoke('sidebar:goHome', { itemId: row.id });
            }}
            data-testid="go-home"
          >
            <CornerUpLeft size={13} />
          </button>
        )}
        <button
          type="button"
          aria-label={`Close ${row.title}`}
          className="grid size-5 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/10"
          onClick={close}
          data-testid="tab-close"
        >
          <X size={13} strokeWidth={2.25} />
        </button>
      </div>
    </li>
  );
}

/** A collapsible folder (F-05). */
export function FolderRow({
  row,
  renaming,
  onRenamed,
}: {
  row: SidebarRow;
  renaming: boolean;
  onRenamed: () => void;
}) {
  const dnd = useRowDnd(row);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!row.collapsed}
        {...dnd.props}
        className={`press animate-row-in flex h-[34px] items-center gap-2 rounded-[12px] pr-1 text-[13px] font-medium hover:bg-[var(--hover)] ${dnd.indicator} ${dnd.isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: 6 + row.depth * INDENT_PX }}
        onClick={() => void invoke('sidebar:toggleFolder', { itemId: row.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('sidebar:itemMenu', { itemId: row.id });
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('orbit:rename', { detail: row.id }));
        }}
        data-testid="folder-row"
        data-live-folder={row.liveFolder}
        title={row.liveError ? `Couldn’t refresh: ${row.liveError}` : undefined}
      >
        <ChevronRight
          size={14}
          className={`shrink-0 opacity-60 transition-transform ${row.collapsed ? '' : 'rotate-90'}`}
        />
        {row.liveFolder ? (
          <Rss
            size={14}
            className={`shrink-0 ${row.liveError ? 'text-amber-400' : 'opacity-70'}`}
            aria-label={row.liveError ? `Live Folder: ${row.liveError}` : 'Live Folder'}
          />
        ) : (
          <Folder size={14} className="shrink-0 opacity-70" />
        )}
        {renaming ? (
          <RenameInput
            initial={row.title}
            onDone={(value) => {
              if (value !== null) void invoke('sidebar:rename', { itemId: row.id, title: value });
              onRenamed();
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{row.title}</span>
        )}
      </div>
    </li>
  );
}

export function RowList({
  rows,
  activeId,
  renamingId,
  onRenamed,
  testId,
}: {
  rows: SidebarRow[];
  activeId: string | null;
  renamingId: string | null;
  onRenamed: () => void;
  testId: string;
}) {
  return (
    <ul className="flex flex-col gap-0.5" data-testid={testId}>
      {rows.map((row) =>
        row.kind === 'folder' ? (
          <FolderRow
            key={row.id}
            row={row}
            renaming={renamingId === row.id}
            onRenamed={onRenamed}
          />
        ) : (
          <TabRow
            key={row.id}
            row={row}
            active={row.id === activeId}
            renaming={renamingId === row.id}
            onRenamed={onRenamed}
          />
        ),
      )}
    </ul>
  );
}
