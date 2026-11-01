import { ArrowDown, Plus, X } from 'lucide-react';
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
 * Tabs on top (owner request): the space's tabs in a strip across the window instead of the
 * sidebar — spaces, then favorites and pinned tabs as icons, then Today's tabs as pills that
 * shrink as more open. Same tabs, same right-click menu; ⌘-number and ⌃Tab work as always.
 */
export function TabStrip({
  rect,
  sidebar,
  downloads,
}: {
  rect: Rect;
  sidebar: SidebarSnapshot;
  downloads: DownloadView[];
}) {
  const icons = [...sidebar.favorites, ...sidebar.pinned].filter((r) => r.kind === 'tab');
  const today = sidebar.today.filter((r) => r.kind === 'tab');
  return (
    <div
      className="drag-region absolute flex items-center gap-1 pr-3 pl-[84px] text-[var(--sidebar-fg)]"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      data-testid="tab-strip"
    >
      {sidebar.spaces.length > 1 && (
        <div className="no-drag mr-1 flex shrink-0 items-center gap-0.5">
          {sidebar.spaces.map((space, i) => (
            <Tip key={space.id} label={space.name} keys={i < 9 ? `⌃${i + 1}` : undefined}>
              <button
                key={space.id}
                type="button"
                aria-label={space.name}
                aria-current={space.id === sidebar.activeSpaceId ? 'true' : undefined}
                onClick={() => void invoke('spaces:activate', { spaceId: space.id })}
                className={`press grid size-7 place-items-center rounded-[9px] ${
                  space.id === sidebar.activeSpaceId
                    ? 'bg-[var(--row-active)]'
                    : 'opacity-55 hover:bg-[var(--hover)] hover:opacity-90'
                }`}
                data-testid="strip-space"
              >
                <SpaceIcon icon={space.icon} size={14} />
              </button>
            </Tip>
          ))}
        </div>
      )}
      {icons.map((row) => (
        <Tip key={row.id} label={row.title}>
          <button
            key={row.id}
            type="button"
            aria-label={row.title}
            aria-current={row.id === sidebar.activeItemId ? 'page' : undefined}
            onClick={() => activate(row)}
            onContextMenu={(e) => menu(e, row)}
            className={`press no-drag grid size-8 shrink-0 place-items-center rounded-[11px] ${
              row.id === sidebar.activeItemId
                ? 'bg-[var(--row-active)] shadow-[var(--row-shadow)]'
                : `hover:bg-[var(--hover)] ${row.live ? '' : 'opacity-60'}`
            }`}
            data-testid="strip-pinned"
          >
            <TabIcon row={row} />
          </button>
        </Tip>
      ))}
      {icons.length > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-[var(--hover)]" />}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {today.map((row) => {
          const active = row.id === sidebar.activeItemId;
          return (
            <Tip key={row.id} label={row.title}>
              <div
                key={row.id}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                onClick={() => activate(row)}
                onKeyDown={(e) => e.key === 'Enter' && activate(row)}
                onAuxClick={(e) => e.button === 1 && void invoke('tabs:close', { tabId: row.id })}
                onContextMenu={(e) => menu(e, row)}
                className={`press no-drag group flex h-8 max-w-[220px] min-w-[38px] flex-1 cursor-default items-center gap-2 rounded-[11px] pr-1 pl-2.5 text-[13px] ${
                  active
                    ? 'bg-[var(--row-active)] font-medium shadow-[var(--row-shadow)]'
                    : 'text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]'
                }`}
                data-testid="strip-tab"
              >
                <TabIcon row={row} />
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <button
                  type="button"
                  aria-label={`Close ${row.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void invoke('tabs:close', { tabId: row.id });
                  }}
                  className={`grid size-5 shrink-0 place-items-center rounded-[6px] hover:bg-[var(--hover)] ${
                    active ? '' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  data-testid="strip-close"
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              </div>
            </Tip>
          );
        })}
        <Tip label="New Tab">
          <button
            type="button"
            aria-label="New Tab"
            onClick={() => void invoke('tabs:create', {})}
            className="press no-drag grid size-8 shrink-0 place-items-center rounded-[11px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
            data-testid="strip-new-tab"
          >
            <Plus size={16} />
          </button>
        </Tip>
      </div>
      <DownloadsButton downloads={downloads} />
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
        className="press no-drag relative ml-1 grid size-8 shrink-0 place-items-center rounded-[11px] text-[var(--sidebar-muted)] hover:bg-[var(--hover)] hover:text-[var(--sidebar-fg)]"
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
