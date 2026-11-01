import { describe, expect, it } from 'vitest';
import { splitKeys } from '@shared/keys';
import { tipWidth, tooltipBox } from '../../src/main/windows/tooltip';

describe('splitKeys', () => {
  it('splits modifiers and the key, macOS order kept', () => {
    expect(splitKeys('⇧⌘C')).toEqual(['⇧', '⌘', 'C']);
    expect(splitKeys('⌥⌘L')).toEqual(['⌥', '⌘', 'L']);
    expect(splitKeys('⌃3')).toEqual(['⌃', '3']);
    expect(splitKeys('⌃Tab')).toEqual(['⌃', 'Tab']);
    expect(splitKeys('⌘[')).toEqual(['⌘', '[']);
    expect(splitKeys('k')).toEqual(['K']);
    expect(splitKeys('')).toEqual([]);
  });
});

describe('tooltipBox', () => {
  const win = { width: 1280, height: 800 };
  it('sits under its control, centred', () => {
    expect(tooltipBox({ x: 100, y: 10, width: 28, height: 28 }, 'bottom', 120, win)).toEqual({
      x: 54,
      y: 44,
      width: 120,
      height: 30,
    });
  });

  it('flips when there is no room, and stays in the window', () => {
    // Near the bottom: above instead.
    expect(tooltipBox({ x: 100, y: 770, width: 28, height: 28 }, 'bottom', 120, win).y).toBe(734);
    // Near the top: below instead.
    expect(tooltipBox({ x: 100, y: 0, width: 28, height: 28 }, 'top', 120, win).y).toBe(34);
    // At the left edge: clamped.
    expect(tooltipBox({ x: 0, y: 10, width: 20, height: 20 }, 'bottom', 120, win).x).toBe(6);
    // Beside, or on the left if the right has no room.
    expect(tooltipBox({ x: 10, y: 100, width: 40, height: 40 }, 'right', 100, win)).toMatchObject({
      x: 56,
      y: 105,
    });
    expect(tooltipBox({ x: 1200, y: 100, width: 40, height: 40 }, 'right', 100, win).x).toBe(1094);
  });

  it('gives key caps room', () => {
    expect(tipWidth('Copy Link', ['⇧', '⌘', 'C'])).toBeGreaterThan(tipWidth('Copy Link', []));
    expect(tipWidth('Copy Link', [])).toBeGreaterThan(9 * 6);
  });
});
