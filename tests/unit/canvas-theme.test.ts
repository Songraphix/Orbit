import { describe, expect, it } from 'vitest';
import {
  canvasTheme,
  GLASS_CONTRAST,
  paletteFromColors,
  paletteFromCss,
  paletteFromPixels,
  parseColor,
  pickAccents,
  rgbToHsl,
} from '@shared/canvas-theme';
import type { Palette } from '@shared/canvas-theme';
import { contrastRatio, hexToRgb } from '@shared/theme';
import { WALLPAPER_CSS } from '@shared/wallpapers';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';

const alphaOf = (rgba: string) => Number(/\/ ([\d.]+)\)/.exec(rgba)![1]);
const rgbOf = (rgba: string) => {
  const m = /rgb\((\d+) (\d+) (\d+)/.exec(rgba)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
};

/** A synthetic thumbnail: `share` of the pixels one colour, the rest another. */
function pixels(
  a: [number, number, number],
  b: [number, number, number],
  share: number,
  order: 'rgba' | 'bgra' = 'rgba',
) {
  const w = 20;
  const h = 20;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const [r, g, bl] = i < w * h * share ? a : b;
    const px = order === 'rgba' ? [r, g, bl, 255] : [bl, g, r, 255];
    data.set(px, i * 4);
  }
  return { data, w, h };
}

describe('parseColor', () => {
  it('reads hex and both rgb() syntaxes', () => {
    expect(parseColor('#abc')).toEqual({ rgb: [170, 187, 204], alpha: 1 });
    expect(parseColor('#2f7d75')).toEqual({ rgb: [47, 125, 117], alpha: 1 });
    expect(parseColor('rgb(124 196 181 / 0.55)')).toEqual({ rgb: [124, 196, 181], alpha: 0.55 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ rgb: [10, 20, 30], alpha: 0.5 });
    expect(parseColor('transparent')).toBeNull();
  });
});

describe('palettes', () => {
  it('reads a built-in atmosphere: its base and its light fields', () => {
    const p = paletteFromCss(WALLPAPER_CSS.tide);
    expect(p.swatches.length).toBeGreaterThan(3);
    expect(p.swatches.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 1);
    expect(canvasTheme(p).tone).toBe('dark');
    expect(canvasTheme(paletteFromCss(WALLPAPER_CSS.pearl)).tone).toBe('light');
  });

  it('reads every built-in wallpaper', () => {
    for (const w of BUILTIN_WALLPAPERS) {
      const p = paletteFromCss(WALLPAPER_CSS[w.id]);
      expect(p.average, w.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.swatches.length, w.id).toBeGreaterThan(0);
    }
  });

  it('finds the main colours of a thumbnail (RGBA or BGRA) with their shares', () => {
    for (const order of ['rgba', 'bgra'] as const) {
      const { data, w, h } = pixels([200, 40, 60], [20, 30, 90], 0.75, order);
      const p = paletteFromPixels(data, w, h, order);
      expect(p.swatches[0]!.hex).toBe('#c8283c');
      expect(p.swatches[0]!.weight).toBeCloseTo(0.75, 2);
      expect(p.swatches[1]!.hex).toBe('#141e5a');
    }
  });

  it('skips transparent pixels', () => {
    const data = new Uint8Array(4 * 4).fill(0);
    expect(paletteFromPixels(data, 2, 2).average).toBe('#18181c');
  });
});

describe('accents', () => {
  it('takes the liveliest colour that is really there', () => {
    const p = paletteFromColors(['#0b1026', '#7b5cff']);
    const { accent } = pickAccents(p);
    const [h] = rgbToHsl(hexToRgb(accent));
    expect(h).toBeGreaterThan(230);
    expect(h).toBeLessThan(270);
  });

  it('a grey wallpaper gets a calm blue-grey', () => {
    const { accent, accent2 } = pickAccents(paletteFromColors(['#808080']));
    expect(accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(accent2).not.toBe(accent);
  });

  it('a second accent is a different hue', () => {
    const { accent, accent2 } = pickAccents(paletteFromColors(['#ff7e5f', '#6a3093', '#1b0b2e']));
    const gap = Math.abs(rgbToHsl(hexToRgb(accent))[0] - rgbToHsl(hexToRgb(accent2))[0]);
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(30);
  });
});

describe('canvasTheme', () => {
  const walls: Record<string, Palette> = {
    bright: paletteFromColors(['#f4f1ea', '#ffffff', '#e6e9ef']),
    dark: paletteFromColors(['#05060f', '#111418']),
    warm: paletteFromColors(['#ff9a5a', '#e8590c', '#ffd1a9']),
    cool: paletteFromColors(['#6a8cff', '#3a7bd5', '#a1c4fd']),
    mid: paletteFromColors(['#7a6aa8', '#8a76b8', '#5f5590']),
    dusk: paletteFromCss(WALLPAPER_CSS.dusk),
  };

  it('text reads on every glass tier, over bright, dark, warm, cool and mid wallpapers', () => {
    for (const [name, palette] of Object.entries(walls)) {
      for (const glass of ['subtle', 'balanced', 'strong'] as const) {
        const t = canvasTheme(palette, { glass });
        const fg = rgbOf(t.vars['--fg']!);
        for (const tier of ['standard', 'deep', 'elevated']) {
          const solid = hexToRgb(t.vars[`--solid-${tier}`]!);
          expect(contrastRatio(solid, fg), `${name} ${glass} ${tier}`).toBeGreaterThanOrEqual(
            GLASS_CONTRAST - 0.01,
          );
        }
      }
    }
  });

  it('picks the tone from the wallpaper', () => {
    expect(canvasTheme(walls.bright!).tone).toBe('light');
    expect(canvasTheme(walls.dark!).tone).toBe('dark');
    expect(canvasTheme(walls.mid!).tone).toBe('dark');
  });

  it('subtle glass is more solid than strong glass', () => {
    const subtle = canvasTheme(walls.dusk!, { glass: 'subtle' }).vars;
    const strong = canvasTheme(walls.dusk!, { glass: 'strong' }).vars;
    expect(alphaOf(subtle['--glass-deep']!)).toBeGreaterThan(alphaOf(strong['--glass-deep']!));
  });

  it('deeper tiers are more solid than lighter ones', () => {
    const v = canvasTheme(walls.cool!).vars;
    expect(alphaOf(v['--glass-elevated']!)).toBeGreaterThan(alphaOf(v['--glass-light']!));
  });

  it('keeps a chosen accent instead of the wallpaper’s', () => {
    const t = canvasTheme(walls.warm!, { accent: '#0a7cff' });
    expect(t.accent).toBe('#0a7cff');
    expect(t.vars['--canvas-accent']).toBe('#0a7cff');
    expect(canvasTheme(walls.warm!).accent).not.toBe('#0a7cff');
  });
});
