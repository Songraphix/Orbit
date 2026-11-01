import type { Layout, Rect } from '@shared/types/layout';
import { Sidebar } from './Sidebar';
import { useLayout } from './use-layout';

const toStyle = (r: Rect) => ({ left: r.x, top: r.y, width: r.width, height: r.height });

export function ShellApp() {
  const layout = useLayout();

  return (
    <div className="relative h-full overflow-hidden" style={{ background: 'var(--sidebar-bg)' }}>
      {layout && <Chrome layout={layout} />}
    </div>
  );
}

function Chrome({ layout }: { layout: Layout }) {
  return (
    <>
      {layout.sidebar.visible && <Sidebar width={layout.sidebar.width} />}
      {/* Content card: the toolbar strip (step 6) on top, the web view (step 5) below. */}
      <div
        className="absolute overflow-hidden bg-white/95 shadow-sm"
        style={{ ...toStyle(layout.card), borderRadius: layout.radius }}
        data-testid="content-card"
      >
        <div className="drag-region" style={{ height: layout.toolbar.height }} />
        <div className="flex h-full items-center justify-center pb-9 text-sm text-neutral-400">
          No tab open
        </div>
      </div>
    </>
  );
}
