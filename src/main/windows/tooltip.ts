import type { Rect } from '@shared/types/layout';

export type TooltipSide = 'top' | 'bottom' | 'right';

export const TIP_HEIGHT = 30;

/**
 * About how wide a tooltip is (label at 12.5 px semibold, key caps, padding), with a little to
 * spare: the overlay centres the pill in this box. Pure.
 */
export function tipWidth(label: string, keys: readonly string[]): number {
  const caps = keys.reduce((n, k) => n + Math.max(18, k.length * 7 + 8) + 3, 0);
  return Math.ceil(label.length * 7.2 + 26 + (keys.length > 0 ? caps + 6 : 0) + 10);
}

/**
 * Where a tooltip goes: under its control (or over it, or beside it), flipped if there's no room,
 * and kept inside the window. Pure.
 */
export function tooltipBox(
  anchor: Rect,
  side: TooltipSide,
  width: number,
  window: { width: number; height: number },
): Rect {
  const gap = 6;
  const margin = 6;
  const height = TIP_HEIGHT;
  let x: number;
  let y: number;
  if (side === 'right') {
    x = anchor.x + anchor.width + gap;
    y = anchor.y + anchor.height / 2 - height / 2;
    if (x + width > window.width - margin) x = anchor.x - gap - width; // no room: the left
  } else {
    x = anchor.x + anchor.width / 2 - width / 2;
    const below = anchor.y + anchor.height + gap;
    const above = anchor.y - gap - height;
    y = side === 'bottom' ? below : above;
    if (side === 'bottom' && y + height > window.height - margin) y = above;
    if (side === 'top' && y < margin) y = below;
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    x: Math.round(clamp(x, margin, window.width - margin - width)),
    y: Math.round(clamp(y, margin, window.height - margin - height)),
    width: Math.ceil(Math.min(width, window.width - margin * 2)),
    height,
  };
}
