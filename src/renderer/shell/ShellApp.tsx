import { ResponsiveFrame } from './ResponsiveFrame';
import type { FocusSession } from '@shared/focus';
import type { ProfileView } from '@shared/profile';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { themeToVars } from '@shared/theme';
import { useColorMode } from './use-color-mode';
import { useUiPrefs } from '../ui/prefs-store';
import { DEFAULT_THEME } from '@shared/types/space';
import type { SidebarSnapshot } from '@shared/types/space';
import type { Layout, Rect } from '@shared/types/layout';
import type { DownloadView } from '@shared/types/downloads';
import type { FindState } from '@shared/types/find';
import type { LibrarySection } from '@shared/types/library';
import type { MediaState } from '@shared/types/media';
import type { TabState, TabsSnapshot } from '@shared/types/tabs';
import { LittleBar } from './LittleBar';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { TabStrip } from './TabStrip';
import { useMainState } from './use-main-state';

/** Arc-like film grain over the sidebar (strength from the space's theme). */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const toStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

/** The same renderer draws the main window's chrome, or a Little Orbit window's bar. */
export function ShellApp() {
  const little = new URLSearchParams(window.location.search).get('mode') === 'little';
  return little ? <LittleBar /> : <MainShell />;
}

function MainShell() {
  const layout = useMainState('state:layout');
  const tabs = useMainState('state:tabs');
  const find = useMainState('state:find');
  const sidebar = useMainState('state:sidebar');
  const downloads = useMainState('state:downloads');
  const media = useMainState('state:media');
  const library = useMainState('state:library');
  const focus = useMainState('state:focus');

  // ThemeEngine: the active space's theme becomes CSS variables for the whole shell.
  const theme = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId)?.theme ?? DEFAULT_THEME;
  const mode = useColorMode();
  const ui = useUiPrefs();
  // Settings → Appearance → Accent replaces the Space's accent everywhere.
  const accent = ui?.accent ?? null;
  const vars = useMemo(
    () => ({ ...themeToVars(theme, mode), ...(accent ? { '--accent': accent } : {}) }),
    [theme, mode, accent],
  );
  const solid = ui?.surfaces === 'solid';

  return (
    <div
      className="relative h-full overflow-hidden transition-[background] duration-500"
      style={{ ...(vars as CSSProperties), background: 'var(--sidebar-bg)' }}
      data-testid="shell"
      data-surfaces={solid ? 'solid' : 'glass'}
    >
      {/* Solid surfaces: an opaque base under the Space's colours (no desktop showing through). */}
      {solid && (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: mode === 'dark' ? 'rgb(24 24 28)' : 'rgb(240 240 244)' }}
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{ background: GRAIN, opacity: 'var(--grain)' }}
      />
      {layout && (
        <Chrome
          layout={layout}
          tabs={tabs}
          find={find}
          sidebar={sidebar}
          downloads={downloads?.items ?? []}
          media={media}
          librarySection={library?.section ?? null}
          focus={focus}
        />
      )}
    </div>
  );
}

/**
 * While the sidebar edge is dragged, main hides the live web view (native views swallow pointer
 * events) and we show a still snapshot of it instead, stretched to the moving web-view area.
 */
function useResizeSnapshot() {
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const resizing = useRef(false);

  const onResizeStart = useCallback(() => {
    resizing.current = true;
    void window.orbit.invoke('sidebar:beginResize', {}).then((r) => {
      if (resizing.current) setSnapshot(r.snapshot);
    });
  }, []);
  const onResizeEnd = useCallback(() => {
    resizing.current = false;
    void window.orbit.invoke('sidebar:endResize', {}).then(() => setSnapshot(null));
  }, []);

  return { snapshot, onResizeStart, onResizeEnd };
}

function Chrome({
  layout,
  tabs,
  find,
  sidebar,
  downloads,
  media,
  librarySection,
  focus,
}: {
  layout: Layout;
  tabs: TabsSnapshot | null;
  find: FindState | null;
  sidebar: SidebarSnapshot | null;
  downloads: DownloadView[];
  media: MediaState;
  librarySection: LibrarySection | null;
  focus: FocusSession | null;
}) {
  const activeTab = tabs?.tabs.find((t) => t.id === tabs.activeTabId) ?? null;
  const { snapshot, onResizeStart, onResizeEnd } = useResizeSnapshot();
  // Split view (F-13): one card per pane, left to right. HTML fullscreen shows only the focused one.
  const split = tabs?.split && layout.panes.length === 2 ? tabs.split : null;
  const paneTabs = split
    ? split.tabIds.map((id) => tabs?.tabs.find((t) => t.id === id) ?? null)
    : [activeTab];

  return (
    <>
      {layout.tabStrip && sidebar && (
        <TabStrip rect={layout.tabStrip} sidebar={sidebar} downloads={downloads} />
      )}
      {!layout.sidebar.visible && !layout.fullscreen && !layout.tabStrip && (
        // The hidden sidebar's edge: resting the pointer here slides it out (F-01).
        <div
          className="absolute inset-y-0 left-0 z-10"
          style={{ width: layout.card.x }}
          onPointerEnter={() => void window.orbit.invoke('sidebar:peek', { open: true })}
          data-testid="sidebar-edge"
        />
      )}
      {layout.sidebar.visible && (
        <Sidebar
          width={layout.sidebar.width}
          sidebar={sidebar}
          downloads={downloads}
          media={media}
          librarySection={librarySection}
          activeTab={activeTab}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
        />
      )}
      {paneTabs.map((tab, i) => {
        const pane = layout.panes[i];
        if (!pane) return null;
        return (
          <ContentCard
            key={split ? (tab?.id ?? i) : 'single'}
            pane={pane}
            radius={layout.radius}
            tab={tab}
            showToolbar={!layout.fullscreen}
            // No "show sidebar" button with tabs on top (the strip is the tab list).
            sidebarVisible={layout.sidebar.visible || layout.tabStrip !== null || i > 0}
            find={find}
            focused={!split || tab?.id === tabs?.activeTabId}
            inSplit={split !== null}
            snapshot={split ? null : snapshot}
            // The right-most toolbar has the Notes button.
            notesOpen={i === paneTabs.length - 1 ? layout.notes !== null : undefined}
            profile={i === paneTabs.length - 1 ? sidebar?.profile : undefined}
            assistant={i === paneTabs.length - 1 ? (sidebar?.tidy.assistant ?? false) : false}
            focus={i === paneTabs.length - 1 ? focus : null}
          />
        );
      })}
      {layout.notes && (
        // Depth under the Notes panel (its page is a native view on top).
        <div
          className="card-depth absolute bg-[var(--sidebar-bg)]"
          style={{ ...toStyle(layout.notes), borderRadius: layout.radius }}
          data-testid="notes-card"
        />
      )}
      {split && layout.divider && (
        <SplitDivider rect={layout.divider} left={layout.panes[0]!} right={layout.panes[1]!} />
      )}
    </>
  );
}

type Pane = Layout['panes'][number];

/**
 * A content card: toolbar on top; the tab's web view is a native view that main places exactly
 * over the area below it. In split view each pane is a card, and the focused one is outlined.
 */
function ContentCard(props: {
  pane: Pane;
  radius: number;
  tab: TabState | null;
  showToolbar: boolean;
  sidebarVisible: boolean;
  find: FindState | null;
  focused: boolean;
  inSplit: boolean;
  snapshot: string | null;
  notesOpen: boolean | undefined;
  assistant: boolean;
  profile: ProfileView | undefined;
  focus: FocusSession | null;
}) {
  const { pane, tab, inSplit, focused } = props;
  const webViewTop = pane.webView.y - pane.card.y;
  return (
    <div
      className="card-depth ui-light absolute overflow-hidden bg-white transition-[box-shadow] duration-200"
      style={{
        ...toStyle(pane.card),
        borderRadius: props.radius,
        // Split view: the focused pane gets a soft accent rim on top of its depth.
        ...(inSplit && focused
          ? {
              boxShadow:
                '0 0 0 2px color-mix(in srgb, var(--accent) 80%, transparent), 0 10px 30px -10px rgb(0 0 0 / 0.4)',
            }
          : {}),
      }}
      // Clicking the other pane's toolbar focuses that pane first.
      onMouseDownCapture={() => {
        if (inSplit && !focused && tab)
          void window.orbit.invoke('tabs:activate', { tabId: tab.id });
      }}
      data-testid="content-card"
      data-focused={focused}
      data-tab-id={tab?.id}
    >
      {props.showToolbar && (
        <Toolbar
          tab={tab}
          height={pane.toolbar.height}
          sidebarVisible={props.sidebarVisible}
          find={props.find}
          focused={focused}
          inSplit={inSplit}
          notesOpen={props.notesOpen}
          assistant={props.assistant}
          profile={props.profile}
          focus={props.focus}
        />
      )}
      {tab?.viewport && (
        <ResponsiveFrame area={pane.webView} origin={pane.card} viewport={tab.viewport} />
      )}
      {props.snapshot && (
        <img
          src={props.snapshot}
          alt=""
          className="pointer-events-none absolute left-0 w-full object-cover object-left-top"
          style={{ top: webViewTop, height: pane.webView.height }}
          data-testid="resize-snapshot"
        />
      )}
      {tab?.crashed && (
        <div
          className="flex h-full flex-col items-center justify-center gap-3 pb-9 text-sm text-neutral-500"
          data-testid="crashed"
        >
          <span className="text-3xl">☁︎</span>
          This page crashed.
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-on-accent hover:brightness-110"
            onClick={() =>
              void window.orbit.invoke('tabs:navigate', { tabId: tab.id, action: 'reload' })
            }
            data-testid="crashed-reload"
          >
            Reload
          </button>
        </div>
      )}
      {!tab && (
        <div className="flex h-full items-center justify-center pb-9 text-sm text-neutral-400">
          No tab open — press ⌘T
        </div>
      )}
    </div>
  );
}

/**
 * The gap between split panes. Dragging it resizes them; main hides both pages meanwhile
 * (native views would swallow the pointer). Double-click evens them out.
 */
function SplitDivider({ rect, left, right }: { rect: Rect; left: Pane; right: Pane }) {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragging(true);
    void window.orbit.invoke('split:beginResize', {});
    const x0 = left.card.x;
    const usable = left.card.width + right.card.width;
    const gap = right.card.x - (left.card.x + left.card.width);
    const onMove = (ev: PointerEvent) => {
      // Chromium sends a synthetic move after the view hides; ignore moves without the button.
      if ((ev.buttons & 1) === 0) return;
      void window.orbit.invoke('split:setRatio', { ratio: (ev.clientX - gap / 2 - x0) / usable });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setDragging(false);
      void window.orbit.invoke('split:endResize', {});
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="absolute flex cursor-col-resize items-center justify-center"
      style={toStyle(rect)}
      onPointerDown={onPointerDown}
      onDoubleClick={() => void window.orbit.invoke('split:setRatio', { ratio: 0.5 })}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split view"
      data-testid="split-divider"
    >
      <div
        className={`h-10 w-1 rounded-full transition-colors ${dragging ? 'bg-[var(--accent)]' : 'bg-[var(--sidebar-fg)] opacity-20'}`}
      />
    </div>
  );
}
