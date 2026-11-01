/**
 * Pure window-placement maths (no Electron imports) so it can be unit tested.
 */
export type Rect = { x: number; y: number; width: number; height: number };

export const DEFAULT_SIZE = { width: 1280, height: 820 } as const;
export const MIN_SIZE = { width: 640, height: 400 } as const;

/** How much of the window's top strip must be on a display for the saved position to count. */
const MIN_VISIBLE = { width: 120, height: 40 } as const;

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function centered(size: { width: number; height: number }, area: Rect): Rect {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

/**
 * Decides where the main window opens.
 * - No saved bounds → default size, centred on the primary display.
 * - Saved bounds whose top strip (where the traffic lights and drag region are) is still
 *   reachable on some display → restored, shrunk to fit that display if needed.
 * - Otherwise (e.g. the monitor was unplugged) → saved size, centred on the primary display.
 *
 * @param workAreas each display's work area; the first is the primary display.
 */
export function resolveWindowBounds(saved: Rect | null, workAreas: readonly Rect[]): Rect {
  const primary = workAreas[0];
  if (!primary) throw new Error('resolveWindowBounds needs at least one display');
  if (!saved) return centered(DEFAULT_SIZE, primary);

  const size = {
    width: Math.max(saved.width, MIN_SIZE.width),
    height: Math.max(saved.height, MIN_SIZE.height),
  };
  const topStrip: Rect = { x: saved.x, y: saved.y, width: size.width, height: MIN_VISIBLE.height };

  const host = workAreas.find((area) => {
    const overlap = intersection(topStrip, area);
    return overlap !== null && overlap.width >= MIN_VISIBLE.width && saved.y >= area.y;
  });
  if (!host) return centered(size, primary);

  // Fit inside the host display, keeping the saved position where possible.
  const width = Math.min(size.width, host.width);
  const height = Math.min(size.height, host.height);
  const x = Math.min(Math.max(saved.x, host.x), host.x + host.width - width);
  const y = Math.min(Math.max(saved.y, host.y), host.y + host.height - height);
  return { x, y, width, height };
}
