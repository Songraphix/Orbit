import { describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, resolveWindowBounds } from '../../src/main/windows/window-state';

// Typical Mac mini setup: a 1920×1080 primary display (menu bar 25 px) and an optional
// second display to the right.
const primary = { x: 0, y: 25, width: 1920, height: 1055 };
const right = { x: 1920, y: 0, width: 2560, height: 1440 };

describe('resolveWindowBounds', () => {
  it('centres the default size on the primary display when nothing is saved', () => {
    expect(resolveWindowBounds(null, [primary])).toEqual({
      x: (1920 - DEFAULT_SIZE.width) / 2,
      y: 25 + Math.round((1055 - DEFAULT_SIZE.height) / 2),
      ...DEFAULT_SIZE,
    });
  });

  it('restores saved bounds that are fully on screen', () => {
    const saved = { x: 100, y: 80, width: 1400, height: 900 };
    expect(resolveWindowBounds(saved, [primary])).toEqual(saved);
  });

  it('restores bounds on a secondary display', () => {
    const saved = { x: 2200, y: 200, width: 1600, height: 1000 };
    expect(resolveWindowBounds(saved, [primary, right])).toEqual(saved);
  });

  it('re-centres on the primary display when the saved display is gone', () => {
    const saved = { x: 2200, y: 200, width: 1600, height: 1000 };
    const result = resolveWindowBounds(saved, [primary]);
    expect(result).toEqual({ x: 160, y: 53, width: 1600, height: 1000 });
  });

  it('nudges a partly off-screen window fully onto its display', () => {
    const saved = { x: 1500, y: 100, width: 1200, height: 800 };
    expect(resolveWindowBounds(saved, [primary])).toEqual({
      x: 1920 - 1200,
      y: 100,
      width: 1200,
      height: 800,
    });
  });

  it('never restores a title bar hidden above the work area (under the menu bar)', () => {
    const saved = { x: 100, y: -500, width: 1200, height: 800 };
    const result = resolveWindowBounds(saved, [primary]);
    expect(result.y).toBeGreaterThanOrEqual(primary.y);
  });

  it('shrinks a window larger than its display to fit', () => {
    const saved = { x: 0, y: 25, width: 3000, height: 2000 };
    expect(resolveWindowBounds(saved, [primary])).toEqual(primary);
  });

  it('enforces the minimum size on corrupt tiny bounds', () => {
    const result = resolveWindowBounds({ x: 10, y: 30, width: 5, height: 5 }, [primary]);
    expect(result.width).toBeGreaterThanOrEqual(640);
    expect(result.height).toBeGreaterThanOrEqual(400);
  });

  it('requires at least one display', () => {
    expect(() => resolveWindowBounds(null, [])).toThrow();
  });
});
