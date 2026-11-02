import { describe, expect, it } from 'vitest';
import { parseColor, rgbToHsl } from '@shared/toolkit/color';
import {
  HARMONIES,
  extractPalette,
  harmony,
  paletteCss,
  randomBase,
} from '@shared/toolkit/palette';

const hue = (hex: string) => rgbToHsl(parseColor(hex)!).h;

describe('palettes', () => {
  const base = parseColor('#6d5dfc')!;

  it('every harmony gives five colours, the base among them', () => {
    for (const mode of HARMONIES) {
      const colors = harmony(base, mode);
      expect(colors).toHaveLength(5);
      for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors).toContain('#6d5dfc');
    }
  });

  it('places companions around the colour wheel', () => {
    const h = hue('#6d5dfc');
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    const comp = harmony(base, 'complementary');
    expect(comp.some((c) => near(hue(c), (h + 180) % 360) < 3)).toBe(true);
    const tri = harmony(base, 'triadic');
    expect(tri.some((c) => near(hue(c), (h + 120) % 360) < 3)).toBe(true);
    expect(tri.some((c) => near(hue(c), (h + 240) % 360) < 3)).toBe(true);
  });

  it('ignores a colour’s transparency', () => {
    expect(harmony({ ...base, a: 0.5 }, 'analogous')).toContain('#6d5dfc');
  });

  it('random bases stay pleasant and are reproducible with a seed', () => {
    const seq = [0.1, 0.5, 0.5];
    let i = 0;
    const c = randomBase(() => seq[i++ % seq.length]!);
    const { s, l } = rgbToHsl(c);
    expect(s).toBeGreaterThanOrEqual(50);
    expect(l).toBeGreaterThanOrEqual(40);
    expect(l).toBeLessThanOrEqual(65);
  });

  it('writes CSS custom properties', () => {
    expect(paletteCss(['#111111', '#222222'])).toBe(
      ':root {\n  --color-1: #111111;\n  --color-2: #222222;\n}',
    );
  });

  it('finds an image’s main colours, most common first, and skips transparent pixels', () => {
    const px: number[] = [];
    const add = (n: number, rgba: number[]) => {
      for (let i = 0; i < n; i++) px.push(...rgba);
    };
    add(600, [250, 20, 20, 255]); // mostly red
    add(300, [20, 20, 240, 255]); // some blue
    add(100, [240, 240, 240, 255]); // a little white
    add(500, [0, 255, 0, 0]); // invisible green
    const palette = extractPalette(px, 3);
    expect(palette[0]).toBe('#fa1414');
    expect(palette).toContain('#1414f0');
    expect(palette).toContain('#f0f0f0');
    expect(palette.some((c) => c === '#00ff00')).toBe(false);
    expect(extractPalette([], 4)).toEqual([]);
  });
});
