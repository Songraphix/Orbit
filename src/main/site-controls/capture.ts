import type { Rect } from '@shared/types/layout';

/**
 * A rectangle dragged in window coordinates → the same area in the page's own coordinates,
 * clipped to the page. Null if nothing of it is on the page. Pure.
 */
export function cropToPage(rect: Rect, page: Rect): Rect | null {
  const x1 = Math.max(rect.x, page.x);
  const y1 = Math.max(rect.y, page.y);
  const x2 = Math.min(rect.x + rect.width, page.x + page.width);
  const y2 = Math.min(rect.y + rect.height, page.y + page.height);
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return {
    x: Math.round(x1 - page.x),
    y: Math.round(y1 - page.y),
    width: Math.round(x2 - x1),
    height: Math.round(y2 - y1),
  };
}
