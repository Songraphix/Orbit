import type { Rect } from '../types/layout';

/**
 * Responsive mode (roadmap P3.6): where a device-sized page sits in the page area — under the
 * shell's device bar, centred, scaled down to fit (never up). Main places the page's view with
 * this; the shell draws the bar and the frame around it with the same numbers. Pure.
 */
export const RESPONSIVE_BAR = 44;
const PAD = 16;

export function fitViewport(
  area: Rect,
  size: { width: number; height: number },
): { bounds: Rect; scale: number } {
  const avail = {
    x: area.x + PAD,
    y: area.y + RESPONSIVE_BAR,
    width: Math.max(1, area.width - PAD * 2),
    height: Math.max(1, area.height - RESPONSIVE_BAR - PAD),
  };
  const scale = Math.min(1, avail.width / size.width, avail.height / size.height);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  return {
    bounds: {
      x: Math.round(avail.x + (avail.width - width) / 2),
      y: avail.y,
      width,
      height,
    },
    scale: Math.round(scale * 1000) / 1000,
  };
}
