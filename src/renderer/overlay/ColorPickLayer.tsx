import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Rect } from '@shared/types/layout';

const LOUPE = 120; // px on screen
const GRID = 11; // pixels across the loupe (odd: one sits in the middle)

/**
 * Pick Color (roadmap P3.5): the page as a still, under a loupe that magnifies the pixels
 * around the pointer and names the one in the middle. Click takes it (main copies it);
 * Esc leaves.
 */
export function ColorPickLayer({ area, image }: { area: Rect; image: string }) {
  const pixels = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; hex: string } | null>(null);

  // The still's pixels, at full (device) resolution.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = pixels.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d', { willReadFrequently: true })?.drawImage(img, 0, 0);
    };
    img.src = image;
  }, [image]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.orbit.invoke('toolkit:cancelPick', {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** The color under (x, y), drawing the loupe around it. */
  const sample = (x: number, y: number): string | null => {
    const canvas = pixels.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context || canvas.width === 0) return null;
    const scaleX = canvas.width / area.width;
    const scaleY = canvas.height / area.height;
    const px = Math.floor((x - area.x) * scaleX);
    const py = Math.floor((y - area.y) * scaleY);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
    const [r = 0, g = 0, b = 0] = context.getImageData(px, py, 1, 1).data;
    const view = loupe.current?.getContext('2d');
    if (view) {
      const half = Math.floor(GRID / 2);
      view.imageSmoothingEnabled = false;
      view.fillStyle = '#000';
      view.fillRect(0, 0, LOUPE * 2, LOUPE * 2);
      view.drawImage(canvas, px - half, py - half, GRID, GRID, 0, 0, LOUPE * 2, LOUPE * 2);
    }
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const hex = sample(event.clientX, event.clientY);
    setAt(hex ? { x: event.clientX, y: event.clientY, hex } : null);
  };

  // Keep the loupe on screen: it flips to the other side near the right and bottom edges.
  const left = at ? (at.x + 24 + LOUPE > window.innerWidth ? at.x - 24 - LOUPE : at.x + 24) : 0;
  const top = at
    ? at.y + 24 + LOUPE + 30 > window.innerHeight
      ? at.y - 24 - LOUPE - 30
      : at.y + 24
    : 0;
  const cell = LOUPE / GRID;
  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      onPointerMove={onMove}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const hex = sample(event.clientX, event.clientY);
        if (hex) void window.orbit.invoke('toolkit:colorPicked', { hex });
      }}
      data-testid="color-pick-layer"
    >
      <img
        src={image}
        alt=""
        draggable={false}
        className="pointer-events-none absolute"
        style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
      />
      <canvas ref={pixels} className="hidden" />
      <div
        className="pointer-events-none absolute flex flex-col items-center gap-1.5"
        style={{ left, top, visibility: at ? 'visible' : 'hidden' }}
        data-testid="color-pick-loupe"
      >
        <div
          className="relative overflow-hidden rounded-full border-[3px] border-white shadow-[0_10px_30px_-6px_rgb(0_0_0/0.55),0_0_0_1px_rgb(0_0_0/0.25)]"
          style={{ width: LOUPE, height: LOUPE }}
        >
          <canvas
            ref={loupe}
            width={LOUPE * 2}
            height={LOUPE * 2}
            style={{ width: LOUPE, height: LOUPE }}
          />
          <div
            className="absolute border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
            style={{
              left: cell * Math.floor(GRID / 2),
              top: cell * Math.floor(GRID / 2),
              width: cell,
              height: cell,
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-2.5 py-1 font-mono text-[12px] text-white shadow-lg">
          <span
            className="size-3 rounded-full ring-1 ring-white/40"
            style={{ background: at?.hex }}
          />
          <span data-testid="color-pick-hex">{at?.hex}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/85 px-3 py-1.5 text-[12px] font-medium text-white">
        Click to pick a color · Esc to cancel
      </div>
    </div>
  );
}
