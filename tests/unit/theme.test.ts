import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, textColorFor, themeToVars } from '@shared/theme';

describe('theme engine', () => {
  it('parses hex and measures contrast', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });

  it('chooses readable text: light on dark colours, dark on light ones', () => {
    expect(textColorFor(['#14102a'])).toEqual([242, 242, 247]);
    expect(textColorFor(['#f6d5dc', '#e9b8c6'])).toEqual([29, 29, 31]);
  });

  it('meets WCAG AA (4.5:1) for sidebar text on every preset-like colour', () => {
    for (const hex of [
      '#2b1b4a',
      '#0f3b57',
      '#5a1f1f',
      '#f6d5dc',
      '#d6e8f7',
      '#efe4cf',
      '#808080',
    ]) {
      const fg = textColorFor([hex]);
      expect(contrastRatio(fg, hexToRgb(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('builds a gradient for several colours and a flat tint for one', () => {
    const multi = themeToVars({
      mode: 'dark',
      colors: ['#2b1b4a', '#14102a'],
      intensity: 0.7,
      noise: 0.2,
    });
    expect(multi['--sidebar-bg']).toMatch(/^linear-gradient\(160deg/);
    const single = themeToVars({ mode: 'dark', colors: ['#2b1b4a'], intensity: 0.7, noise: 0 });
    expect(single['--sidebar-bg']).toMatch(/^rgb\(/);
    expect(single['--grain']).toBe('0');
  });
});
