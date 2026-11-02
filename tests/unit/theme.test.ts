import { describe, expect, it } from 'vitest';
import {
  adaptColor,
  contrastRatio,
  hexToRgb,
  luminance,
  resolveMode,
  textColorFor,
  themeToVars,
} from '@shared/theme';

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

  it('resolves the app appearance: System follows the Mac, Light and Dark are fixed', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('moves a colour to the mode’s side, keeping its hue; colours already there are kept', () => {
    // Midnight in light mode: a pale purple, not a dark one.
    const pale = adaptColor('#2b1b4a', 'light');
    expect(luminance(pale)).toBeGreaterThan(0.55);
    expect(pale[2]).toBeGreaterThan(pale[1]); // still purple-blue
    // Rose in dark mode: a deep rose.
    const deep = adaptColor('#f6d5dc', 'dark');
    expect(luminance(deep)).toBeLessThan(0.05);
    expect(deep[0]).toBeGreaterThan(deep[2]);
    // On their own side, unchanged.
    expect(adaptColor('#2b1b4a', 'dark')).toEqual(hexToRgb('#2b1b4a'));
    expect(adaptColor('#f6d5dc', 'light')).toEqual(hexToRgb('#f6d5dc'));
  });

  it('draws any theme in either mode with readable text and a visible accent', () => {
    const presets = [
      ['#2b1b4a', '#14102a'],
      ['#0f3b57', '#0a1f33'],
      ['#5a1f1f', '#2a0f12'],
      ['#f6d5dc', '#e9b8c6'],
      ['#d6e8f7', '#b9d4ee'],
      ['#efe4cf', '#dccba8'],
    ];
    for (const colors of presets) {
      const theme = { mode: 'dark' as const, colors, intensity: 0.7, noise: 0.1 };
      expect(themeToVars(theme, 'light')['--sidebar-fg']).toBe('rgb(29 29 31 / 1)');
      expect(themeToVars(theme, 'dark')['--sidebar-fg']).toBe('rgb(242 242 247 / 1)');
      const accent = themeToVars(theme, 'light')['--accent'].match(/\d+/g)!.map(Number);
      expect(
        contrastRatio(accent.slice(0, 3) as [number, number, number], [245, 245, 247]),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps a theme’s look in its own mode', () => {
    const midnight = { mode: 'dark' as const, colors: ['#2b1b4a'], intensity: 0.7, noise: 0 };
    expect(themeToVars(midnight)).toEqual(themeToVars(midnight, 'dark'));
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
