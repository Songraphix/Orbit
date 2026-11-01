import { useCallback, useRef, useState } from 'react';
import type { Layout, Rect } from '@shared/types/layout';
import type { TabsSnapshot } from '@shared/types/tabs';
import { Sidebar } from './Sidebar';
import { useMainState } from './use-main-state';

const toStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

export function ShellApp() {
  const layout = useMainState('state:layout');
  const tabs = useMainState('state:tabs');

  return (
    <div className="relative h-full overflow-hidden" style={{ background: 'var(--sidebar-bg)' }}>
      {layout && <Chrome layout={layout} tabs={tabs} />}
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

function Chrome({ layout, tabs }: { layout: Layout; tabs: TabsSnapshot | null }) {
  const hasActiveTab = Boolean(tabs?.activeTabId);
  const { snapshot, onResizeStart, onResizeEnd } = useResizeSnapshot();
  const webViewTop = layout.webView.y - layout.card.y;

  return (
    <>
      {layout.sidebar.visible && (
        <Sidebar
          width={layout.sidebar.width}
          tabs={tabs}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
        />
      )}
      {/* Content card: toolbar strip (step 6) on top; the active tab's web view is a native
          view that main places exactly over the area below it. */}
      <div
        className="absolute overflow-hidden bg-white shadow-sm"
        style={{ ...toStyle(layout.card), borderRadius: layout.radius }}
        data-testid="content-card"
      >
        <div className="drag-region" style={{ height: layout.toolbar.height }} />
        {snapshot && (
          <img
            src={snapshot}
            alt=""
            className="pointer-events-none absolute left-0 w-full object-cover object-left-top"
            style={{ top: webViewTop, height: layout.webView.height }}
            data-testid="resize-snapshot"
          />
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
