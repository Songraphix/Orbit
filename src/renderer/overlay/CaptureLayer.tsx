import { useEffect, useState } from 'react';
import type { Rect } from '@shared/types/layout';

/**
 * Area screenshot (F-12): the page is dimmed; drag to select an area, click for the whole page,
 * Esc to cancel. Main crops and copies the image.
 */
export function CaptureLayer({ area }: { area: Rect }) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.orbit.invoke('capture:cancel', {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const between = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setStart({ x: event.clientX, y: event.clientY });
        setRect(null);
      }}
      onPointerMove={(event) => {
        if (start) setRect(between(start, { x: event.clientX, y: event.clientY }));
      }}
      onPointerUp={(event) => {
        if (!start) return;
        const final = between(start, { x: event.clientX, y: event.clientY });
        setStart(null);
        // A click (no real drag) takes the whole page.
        const whole = final.width < 4 || final.height < 4;
        void window.orbit.invoke('capture:take', { rect: whole ? null : final });
      }}
      data-testid="capture-layer"
    >
      <div
        className="pointer-events-none absolute bg-black/30"
        style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
      />
      {rect && (
        <div
          className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.25)]"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          data-testid="capture-rect"
        />
      )}
      <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/85 px-3 py-1.5 text-[12px] font-medium text-white">
        Drag to capture an area · Click for the whole page · Esc to cancel
      </div>
    </div>
  );
}
