import { describe, expect, it } from 'vitest';
import { POPOUT, popoutBounds } from '../../src/main/media/popout-model';

const screen = { x: 0, y: 25, width: 1440, height: 875 };

describe('popoutBounds', () => {
  it('sits in the bottom-right corner, shaped like the video', () => {
    const b = popoutBounds(screen, 16 / 9);
    expect(b.width).toBe(POPOUT.width);
    expect(b.height).toBe(236);
    expect(b.x + b.width).toBe(screen.width - POPOUT.margin);
    expect(b.y + b.height).toBe(screen.y + screen.height - POPOUT.margin);
  });

  it('keeps tall videos to a sensible height', () => {
    const b = popoutBounds(screen, 9 / 16);
    expect(b.height).toBe(POPOUT.maxHeight);
    expect(b.width).toBe(Math.round(POPOUT.maxHeight * (9 / 16)));
  });

  it('falls back to 16:9 for nonsense, and fits small screens', () => {
    expect(popoutBounds(screen, Number.NaN).height).toBe(236);
    const tiny = popoutBounds({ x: 0, y: 0, width: 300, height: 200 }, 16 / 9);
    expect(tiny.width).toBeLessThanOrEqual(300 - POPOUT.margin * 2);
    expect(tiny.height).toBeLessThanOrEqual(200 - POPOUT.margin * 2);
  });
});
