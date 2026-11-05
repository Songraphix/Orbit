import { ResponsiveFrame } from './ResponsiveFrame';
import type { FocusSession } from '@shared/focus';
import type { ProfileView } from '@shared/profile';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Plus, RotateCw, X } from 'lucide-react';
import { panelApps } from '@shared/apps';
import { themeToVars } from '@shared/theme';
import { useColorMode } from './use-color-mode';
import { useCanvas } from '../ui/canvas-store';
import { Wallpaper } from '../ui/Wallpaper';
import { useUiPrefs } from '../ui/prefs-store';
import { DEFAULT_THEME } from '@shared/types/space';
import type { SidebarRow, SidebarSnapshot } from '@shared/types/space';
import type { Layout, Rect } from '@shared/types/layout';
import type { DownloadView } from '@shared/types/downloads';
import type { FindState } from '@shared/types/find';
import type { LibrarySection } from '@shared/types/library';
import type { MediaState } from '@shared/types/media';
import type { TabState, TabsSnapshot } from '@shared/types/tabs';
import { LittleBar } from './LittleBar';
import { LoadErrorCard } from './LoadErrorCard';
import { Tip } from '../tooltip/Tip';
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
  const canvas = useCanvas();

  // ThemeEngine: the active space's theme becomes CSS variables for the whole shell.
  const theme = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId)?.theme ?? DEFAULT_THEME;
  const mode = useColorMode();
  const ui = useUiPrefs();
  // Settings → Appearance → Accent replaces the Space's accent everywhere; with the Automatic
  // palette, the wallpaper's accent does (UI spec §4).
  const accent = ui?.accent ?? (canvas?.auto ? canvas.accent : null);
  const vars = useMemo(
    () => ({
      ...themeToVars(theme, mode),
      // Everything floats on the wallpaper: text and states come from the canvas's theme, so they
      // read on whatever wallpaper is behind (the Space's colours tint only its accent then).
      ...(canvas
        ? {
            '--sidebar-bg': 'transparent',
            '--sidebar-fg': 'var(--fg)',
            '--sidebar-muted': 'var(--fg-muted)',
            '--hover': 'var(--glass-hover)',
            '--row-active': 'var(--sel-bg)',
            '--tile-bg': 'var(--glass-light)',
            '--row-shadow':
              'inset 0 0 0 0.5px var(--sel-border), inset 0 1px 0 var(--glass-highlight)',
            '--grain': '0',
          }
        : {}),
      ...(accent ? { '--accent': accent } : {}),
    }),
    [theme, mode, accent, canvas],
  );
  const solid = ui?.surfaces === 'solid';

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ ...(vars as CSSProperties), background: 'var(--sidebar-bg)' }}
      data-testid="shell"
      data-surfaces={solid ? 'solid' : 'glass'}
      data-tone={canvas?.tone}
    >
      {canvas && (
        <Wallpaper
          choice={canvas.wallpaper}
          customImage={canvas.customImage}
          look={canvas.look}
          light={canvas.tone === 'light'}
          testId="canvas"
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

  /** The sidebar's edge or the dock's edge started moving. */
  const onResizeStart = useCallback((edge: 'sidebar' | 'dock' = 'sidebar') => {
    resizing.current = true;
    void window.orbit.invoke(`${edge}:beginResize`, {}).then((r) => {
      if (resizing.current) setSnapshot(r.snapshot);
    });
  }, []);
  const onResizeEnd = useCallback((edge: 'sidebar' | 'dock' = 'sidebar') => {
    resizing.current = false;
    void window.orbit.invoke(`${edge}:endResize`, {}).then(() => setSnapshot(null));
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
  // The dock holds Notes or a docked app (App Hub); the Notes button is lit only for Notes.
  const appPanel = useMainState('state:appPanel');
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
          onResizeStart={() => onResizeStart('sidebar')}
          onResizeEnd={() => onResizeEnd('sidebar')}
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
            notesOpen={i === paneTabs.length - 1 ? layout.notes !== null && !appPanel : undefined}
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
      {layout.notes && (
        <AppPanelHeader
          rect={layout.notes}
          radius={layout.radius}
          favorites={sidebar?.favorites ?? []}
        />
      )}
      {layout.notes && (
        <DockEdge
          dock={layout.notes}
          onStart={() => onResizeStart('dock')}
          onEnd={() => onResizeEnd('dock')}
        />
      )}
      {split && layout.divider && (
        <SplitDivider rect={layout.divider} left={layout.panes[0]!} right={layout.panes[1]!} />
      )}
    </>
  );
}

type Pane = Layout['panes'][number];

/** The usual dock width (double-clicking its edge goes back to it). */
const DOCK_USUAL = 380;
/** The gap between the page and the dock that holds its edge. */
const DOCK_GAP = 8;

/**
 * The dock's edge (Notes or a docked app): dragging the gap before it makes the dock wider or
 * narrower; the width is remembered. The page and the dock's page hide meanwhile (a snapshot of
 * the page stands in). Double-click: the usual width.
 */
function DockEdge({
  dock,
  onStart,
  onEnd,
}: {
  dock: Rect;
  onStart: () => void;
  onEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragging(true);
    onStart();
    const right = dock.x + dock.width;
    const onMove = (ev: PointerEvent) => {
      // Chromium sends a synthetic move after the views hide; ignore moves without the button.
      if ((ev.buttons & 1) === 0) return;
      void window.orbit.invoke('dock:setWidth', { width: right - ev.clientX - DOCK_GAP / 2 });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setDragging(false);
      onEnd();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };
  return (
    <div
      className="group absolute flex cursor-col-resize items-center justify-center"
      style={{ left: dock.x - DOCK_GAP, top: dock.y, width: DOCK_GAP, height: dock.height }}
      onPointerEnter={() => void window.orbit.invoke('sidebar:prepareResize', {})}
      onPointerDown={onPointerDown}
      onDoubleClick={() => void window.orbit.invoke('dock:setWidth', { width: DOCK_USUAL })}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      data-testid="dock-edge"
    >
      <div
        className={`h-10 w-1 rounded-full transition-[background,opacity] duration-150 ${dragging ? 'bg-[var(--accent)] opacity-100' : 'bg-[var(--sidebar-fg)] opacity-0 group-hover:opacity-25'}`}
      />
    </div>
  );
}

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
      {tab?.loadError && !tab.crashed && (
        <div className="absolute inset-x-0 bottom-0" style={{ top: webViewTop }}>
          <LoadErrorCard
            code={tab.loadError.code}
            url={tab.loadError.url}
            actions={[
              {
                label: 'Try Again',
                primary: true,
                testId: 'load-error-retry',
                onClick: () =>
                  void window.orbit.invoke('tabs:navigate', { tabId: tab.id, action: 'reload' }),
              },
            ]}
          />
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

/**
 * The docked app's header (App Hub, brief M5): a switcher with this Space's other panel apps
 * (one click swaps; + adds apps in Settings), the app's name, and Back, Reload, Open as Tab and
 * Close. The app itself is a native view main places just below it.
 */
function AppPanelHeader({
  rect,
  radius,
  favorites,
}: {
  rect: Rect;
  radius: number;
  favorites: SidebarRow[];
}) {
  const app = useMainState('state:appPanel');
  if (!app) return null;
  const act = (action: 'close' | 'back' | 'reload' | 'openAsTab' | 'openInWindow' | 'manage') =>
    void window.orbit.invoke('apps:panel', { action });
  const apps = panelApps(favorites);
  return (
    <>
      {app.loadError !== null && (
        // The app couldn't load: main hid its page, so this card shows in the panel.
        <div
          className="ui-light absolute overflow-hidden bg-white"
          style={{
            left: rect.x,
            top: rect.y + 40,
            width: rect.width,
            height: Math.max(0, rect.height - 40),
            borderBottomLeftRadius: radius,
            borderBottomRightRadius: radius,
          }}
        >
          <LoadErrorCard
            compact
            code={app.loadError}
            url={app.url}
            actions={[
              {
                label: 'Try Again',
                primary: true,
                testId: 'load-error-retry',
                onClick: () => act('reload'),
              },
              { label: 'Open as Tab', testId: 'load-error-tab', onClick: () => act('openAsTab') },
              {
                label: 'Open in Window',
                testId: 'load-error-window',
                onClick: () => act('openInWindow'),
              },
            ]}
          />
        </div>
      )}
      <div
        className="ui-light absolute flex items-center gap-1 overflow-hidden border-b border-black/[0.06] bg-white px-2 text-neutral-700"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: 40,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
        }}
        data-testid="app-panel-header"
      >
        {apps.length > 1 ? (
          <div
            className="scrollbar-none flex max-w-[55%] shrink-0 items-center gap-0.5 overflow-x-auto"
            role="tablist"
            aria-label="Panel apps"
            data-testid="app-panel-switcher"
          >
            {apps.map((row) => {
              const current = row.id === app.itemId;
              return (
                <Tip key={row.id} label={row.title || row.url || 'App'}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={current}
                    aria-label={row.title || row.url || 'App'}
                    onClick={() => {
                      if (!current) void window.orbit.invoke('tabs:activate', { tabId: row.id });
                    }}
                    className={`press grid size-7 shrink-0 place-items-center rounded-[8px] transition-colors ${current ? 'bg-black/[0.07]' : 'opacity-60 hover:bg-black/[0.05] hover:opacity-100'}`}
                    data-testid="app-panel-switch"
                    data-current={current}
                  >
                    <AppIcon favicon={row.favicon} title={row.title || row.url || ''} />
                  </button>
                </Tip>
              );
            })}
          </div>
        ) : (
          <AppIcon favicon={app.favicon} title={app.title} />
        )}
        <span
          className="ml-1 min-w-0 flex-1 truncate text-[13px] font-medium"
          data-testid="app-panel-title"
        >
          {app.title}
        </span>
        <HeaderButton label="Add Apps…" onClick={() => act('manage')} testId="app-panel-add">
          <Plus size={14} />
        </HeaderButton>
        <HeaderButton
          label="Back"
          onClick={() => act('back')}
          disabled={!app.canGoBack}
          testId="app-panel-back"
        >
          <ArrowLeft size={14} />
        </HeaderButton>
        <HeaderButton label="Reload" onClick={() => act('reload')} testId="app-panel-reload">
          <RotateCw size={13} className={app.isLoading ? 'animate-spin' : ''} />
        </HeaderButton>
        <HeaderButton label="Open as Tab" onClick={() => act('openAsTab')} testId="app-panel-tab">
          <ExternalLink size={13} />
        </HeaderButton>
        <HeaderButton label="Close" onClick={() => act('close')} testId="app-panel-close">
          <X size={14} />
        </HeaderButton>
        {app.isLoading && (
          // A thin loading line along the header's foot.
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
            data-testid="app-panel-loading"
          >
            <div className="h-full w-1/3 animate-[orbit-loading_1.1s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
          </div>
        )}
      </div>
    </>
  );
}

/** An app's icon; without one, its initial (so apps in the switcher stay tellable apart). */
function AppIcon({ favicon, title }: { favicon: string | null; title: string }) {
  return favicon ? (
    <img src={favicon} alt="" className="size-4 shrink-0 rounded-[4px]" />
  ) : (
    <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-neutral-200 text-[10px] leading-none font-semibold text-neutral-600">
      {(title.replace(/^https?:\/\/(www\.)?/, '')[0] ?? '?').toUpperCase()}
    </span>
  );
}

function HeaderButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <Tip label={props.label}>
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        disabled={props.disabled}
        className="press grid size-7 shrink-0 place-items-center rounded-[8px] hover:bg-black/[0.06] disabled:opacity-30"
        data-testid={props.testId}
      >
        {props.children}
      </button>
    </Tip>
  );
}
