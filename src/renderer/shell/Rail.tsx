import { AppWindow, Home, LayoutGrid, PanelLeft, Plus, Settings, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { Rect } from '@shared/types/layout';
import type { SidebarRow } from '@shared/types/space';
import { DRAG_TYPE, readDragged } from './sidebar/dnd';
import { TabIcon } from './sidebar/Rows';
import { Tip } from '../tooltip/Tip';
import { useShown } from '../ui/prefs-store';

const invoke = window.orbit.invoke;

/** "Inbox (12) – Gmail": the page is telling us something is waiting. */
const hasCount = (title: string) => /\((\d[\d,.]*\+?)\)/.test(title);

/**
 * The app rail (UI spec §7, UI 1 and UI 3): your pinned apps — the same favourites the sidebar
 * grid shows — in a narrow glass island. The app open beside the page has a bar beside it, the
 * page's own favourite a soft fill. Drag to reorder (or drop a tab here to pin it); right-click
 * for the app's menu; + opens the App Library. With tabs on top it also holds Home, Orbit AI
 * and Settings (there's no sidebar to hold them).
 */
export function Rail(props: {
  rect: Rect;
  apps: SidebarRow[];
  /** The tab on screen (its favourite is "current"). */
  activeId: string | null;
  /** The app open in the panel beside the page. */
  panelId: string | null;
  /** The page on screen is the Homepage. */
  home: boolean;
  /** Tabs on top: Home, Orbit AI and Settings live here too. */
  standalone: boolean;
}) {
  const { rect } = props;
  const [over, setOver] = useState<{ id: string | null; after: boolean } | null>(null);
  const assistant = useShown('assistant');

  const drop = (e: DragEvent, beforeId: string | null) => {
    e.preventDefault();
    const itemId = readDragged(e);
    setOver(null);
    if (itemId)
      void invoke('sidebar:move', { itemId, section: 'favorite', parentId: null, beforeId });
  };
  const beforeIdFor = (index: number, after: boolean) =>
    after ? (props.apps[index + 1]?.id ?? null) : props.apps[index]!.id;

  return (
    <nav
      className="no-drag mat-deep absolute flex flex-col items-center gap-1.5 rounded-[22px] py-2.5"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      aria-label="Apps"
      onContextMenu={(e) => {
        // Tabs, apps and text fields have their own menus.
        if (e.defaultPrevented || (e.target as HTMLElement).closest('input, textarea')) return;
        e.preventDefault();
        void invoke('toolbar:menu', {});
      }}
      data-testid="app-rail"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => drop(e, null)}
    >
      <RailButton
        label="Home"
        current={props.home}
        onClick={() => void invoke('tabs:create', {})}
        testId="rail-home"
      >
        <Home size={19} />
      </RailButton>
      {props.standalone && assistant && (
        <RailButton
          label="Ask Orbit"
          keys="⌘J"
          onClick={() => void invoke('assistant:open', {})}
          testId="rail-assistant"
        >
          <Sparkles size={19} />
        </RailButton>
      )}
      <div className="my-0.5 h-px w-7 shrink-0 bg-[var(--glass-border)]" />
      <ul
        className="scrollbar-none flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto"
        data-testid="rail-apps"
      >
        {props.apps.map((row, i) => {
          const inPanel = row.id === props.panelId;
          const current = inPanel || row.id === props.activeId;
          const where =
            row.openIn === 'panel'
              ? 'Opens beside the page'
              : row.openIn === 'window'
                ? 'Opens in a window'
                : null;
          const name = row.title || row.url || 'App';
          return (
            <li
              key={row.id}
              className="relative flex w-full justify-center"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, row.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setOver({ id: row.id, after: e.clientY > r.top + r.height / 2 });
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.stopPropagation();
                drop(e, beforeIdFor(i, over?.id === row.id && over.after));
              }}
            >
              {over?.id === row.id && (
                <span
                  className={`pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-[var(--fg)] ${over.after ? '-bottom-1' : '-top-1'}`}
                />
              )}
              {inPanel && (
                // The app open beside the page (UI 3): a bar at the rail's edge.
                <span
                  className="absolute top-1/2 -left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--fg)]"
                  data-testid="rail-panel-marker"
                />
              )}
              <Tip label={where ? `${name} · ${where}` : name}>
                <button
                  type="button"
                  aria-label={where ? `${name}, ${where.toLowerCase()}` : name}
                  aria-current={current ? 'page' : undefined}
                  onClick={() => void invoke('tabs:activate', { tabId: row.id })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    void invoke('sidebar:itemMenu', { itemId: row.id });
                  }}
                  className={`press lift relative grid size-11 place-items-center rounded-[14px] ${
                    current ? 'mat-sel' : 'hover:bg-[var(--glass-hover)]'
                  }`}
                  data-testid="favorite-tile"
                  data-current={current}
                  data-open-in={row.openIn}
                >
                  <span className="grid size-[22px] place-items-center [&>*]:size-[22px]">
                    <TabIcon row={row} />
                  </span>
                  {row.openIn !== 'tab' && (
                    // Apps that open beside the page, or in their own window, say so in a corner.
                    <span
                      className="pointer-events-none absolute right-1 bottom-1 opacity-55"
                      aria-hidden
                      data-testid="favorite-opens-in"
                      data-open-in={row.openIn}
                    >
                      {row.openIn === 'panel' ? (
                        <PanelLeft size={9} strokeWidth={2.4} />
                      ) : (
                        <AppWindow size={9} strokeWidth={2.4} />
                      )}
                    </span>
                  )}
                  {hasCount(row.title) && (
                    <span
                      className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[#ff453a] shadow-[0_0_0_1.5px_var(--glass-deep)]"
                      aria-label="Something new"
                      data-testid="favorite-dot"
                    />
                  )}
                </button>
              </Tip>
            </li>
          );
        })}
      </ul>
      <RailButton
        label="Add Apps…"
        keys="⇧⌘A"
        onClick={() => void invoke('applib:open', {})}
        testId="rail-add"
        quiet
      >
        <Plus size={19} />
      </RailButton>
      {props.standalone && (
        <>
          <RailButton
            label="App Library"
            onClick={() => void invoke('applib:open', {})}
            testId="rail-library"
            quiet
          >
            <LayoutGrid size={18} />
          </RailButton>
          <RailButton
            label="Settings"
            keys="⌘,"
            onClick={() => void invoke('profile:open', { page: 'settings' })}
            testId="rail-settings"
            quiet
          >
            <Settings size={18} />
          </RailButton>
        </>
      )}
    </nav>
  );
}

function RailButton(props: {
  label: string;
  keys?: string;
  current?: boolean;
  quiet?: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <Tip label={props.label} keys={props.keys}>
      <button
        type="button"
        aria-label={props.label}
        aria-current={props.current ? 'page' : undefined}
        onClick={props.onClick}
        className={`press lift grid size-11 shrink-0 place-items-center rounded-[14px] text-[var(--icon)] hover:text-[var(--fg)] ${
          props.current
            ? 'mat-sel text-[var(--fg)]'
            : props.quiet
              ? 'hover:bg-[var(--glass-hover)]'
              : 'mat-light hover:bg-[var(--glass-hover)]'
        }`}
        data-testid={props.testId}
      >
        {props.children}
      </button>
    </Tip>
  );
}
