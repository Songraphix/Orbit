import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { themeToVars } from '@shared/theme';
import { DEFAULT_THEME } from '@shared/types/space';
import type { SidebarSnapshot } from '@shared/types/space';
import type { Layout, Rect } from '@shared/types/layout';
import type { DownloadView } from '@shared/types/downloads';
import type { FindState } from '@shared/types/find';
import type { MediaState } from '@shared/types/media';
import type { TabsSnapshot } from '@shared/types/tabs';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { useMainState } from './use-main-state';

/** Arc-like film grain over the sidebar (strength from the space's theme). */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const toStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

export function ShellApp() {
  const layout = useMainState('state:layout');
  const tabs = useMainState('state:tabs');
  const find = useMainState('state:find');
  const sidebar = useMainState('state:sidebar');
  const downloads = useMainState('state:downloads');
  const media = useMainState('state:media');

  // ThemeEngine: the active space's theme becomes CSS variables for the whole shell.
  const theme = sidebar?.spaces.find((s) => s.id === sidebar.activeSpaceId)?.theme ?? DEFAULT_THEME;
  const vars = useMemo(() => themeToVars(theme), [theme]);

  return (
    <div
      className="relative h-full overflow-hidden transition-[background] duration-500"
      style={{ ...(vars as CSSProperties), background: 'var(--sidebar-bg)' }}
      data-testid="shell"
    >
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
}: {
  layout: Layout;
  tabs: TabsSnapshot | null;
  find: FindState | null;
  sidebar: SidebarSnapshot | null;
  downloads: DownloadView[];
  media: MediaState;
}) {
  const activeTab = tabs?.tabs.find((t) => t.id === tabs.activeTabId) ?? null;
  const hasActiveTab = activeTab !== null;
  const { snapshot, onResizeStart, onResizeEnd } = useResizeSnapshot();
  const webViewTop = layout.webView.y - layout.card.y;

  return (
    <>
      {layout.sidebar.visible && (
        <Sidebar
          width={layout.sidebar.width}
          sidebar={sidebar}
          downloads={downloads}
          media={media}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
        />
      )}
      {/* Content card: toolbar on top; the active tab's web view is a native view that main
          places exactly over the area below it. */}
      <div
        className="absolute overflow-hidden bg-white shadow-sm"
        style={{ ...toStyle(layout.card), borderRadius: layout.radius }}
        data-testid="content-card"
      >
        {!layout.fullscreen && (
          <Toolbar
            tab={activeTab}
            height={layout.toolbar.height}
            sidebarVisible={layout.sidebar.visible}
            find={find}
          />
        )}
        {snapshot && (
          <img
            src={snapshot}
            alt=""
            className="pointer-events-none absolute left-0 w-full object-cover object-left-top"
            style={{ top: webViewTop, height: layout.webView.height }}
            data-testid="resize-snapshot"
          />
        )}
        {activeTab?.crashed && (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 pb-9 text-sm text-neutral-500"
            data-testid="crashed"
          >
            <span className="text-3xl">☁︎</span>
            This page crashed.
            <button
              type="button"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:brightness-110"
              onClick={() =>
                void window.orbit.invoke('tabs:navigate', { tabId: activeTab.id, action: 'reload' })
              }
              data-testid="crashed-reload"
            >
              Reload
            </button>
          </div>
        )}
        {!hasActiveTab && (
          <div className="flex h-full items-center justify-center pb-9 text-sm text-neutral-400">
            No tab open — press ⌘T
          </div>
        )}
      </div>
    </>
  );
}
