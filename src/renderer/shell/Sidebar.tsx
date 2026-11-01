import { useRef } from 'react';
import type { PointerEvent } from 'react';
import type { TabsSnapshot } from '@shared/types/tabs';
import { TabList } from './TabList';

/** Height of the draggable strip that holds the traffic lights (F-01). */
const TITLE_STRIP_HEIGHT = 44;

type Props = {
  width: number;
  tabs: TabsSnapshot | null;
  /** Called when an edge drag starts/ends, so the shell can stand in for the live web view. */
  onResizeStart: () => void;
  onResizeEnd: () => void;
};

/** The sidebar column (F-01). Spaces, favorites and the bottom bar join it in Phase 3. */
export function Sidebar({ width, tabs, onResizeStart, onResizeEnd }: Props) {
  return (
    <aside
      className="absolute inset-y-0 left-0 flex flex-col"
      style={{ width, color: 'var(--sidebar-fg)' }}
      data-testid="sidebar"
    >
      <div
        className="drag-region shrink-0"
        style={{ height: TITLE_STRIP_HEIGHT }}
        data-testid="title-strip"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {tabs && <TabList snapshot={tabs} />}
      </div>
      <ResizeHandle onStart={onResizeStart} onEnd={onResizeEnd} />
    </aside>
  );
}

/** Drag the sidebar's right edge to resize. Main clamps the width and sends back the layout. */
function ResizeHandle({ onStart, onEnd }: { onStart: () => void; onEnd: () => void }) {
  const frame = useRef<number | null>(null);
  const pending = useRef<number | null>(null);

  const send = () => {
    frame.current = null;
    if (pending.current !== null) {
      void window.orbit.invoke('sidebar:setWidth', { width: pending.current });
      pending.current = null;
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onStart();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    pending.current = e.clientX; // the sidebar starts at x = 0, so the pointer x is the width
    frame.current ??= requestAnimationFrame(send); // at most one update per frame
  };
  // Pointer capture ends on release or if the OS cancels the drag; both finish the resize.
  const onLostPointerCapture = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    send();
    onEnd();
  };

  return (
    <div
      className="no-drag absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
      // Hovering the edge snapshots the page, so a drag can swap it in without delay.
      onPointerEnter={() => void window.orbit.invoke('sidebar:prepareResize', {})}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={onLostPointerCapture}
      data-testid="sidebar-resize-handle"
    />
  );
}
