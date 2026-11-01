import { useRef } from 'react';
import type { PointerEvent } from 'react';

/** Height of the draggable strip that holds the traffic lights (F-01). */
const TITLE_STRIP_HEIGHT = 44;

type Props = { width: number };

/** The sidebar column (F-01). Tabs, spaces and the bottom bar fill it from step 5 / Phase 3. */
export function Sidebar({ width }: Props) {
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
      <div className="flex-1 px-3 text-sm opacity-50">Tabs appear here</div>
      <ResizeHandle />
    </aside>
  );
}

/** Drag the sidebar's right edge to resize. Main clamps the width and sends back the layout. */
function ResizeHandle() {
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
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    pending.current = e.clientX; // the sidebar starts at x = 0, so the pointer x is the width
    frame.current ??= requestAnimationFrame(send); // at most one update per frame
  };

  return (
    <div
      className="no-drag absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      data-testid="sidebar-resize-handle"
    />
  );
}
