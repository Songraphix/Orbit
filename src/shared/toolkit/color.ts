/**
 * Colour tools for the Creative Toolkit (roadmap P3.5): read colours as people write them,
 * convert between formats, and check WCAG 2.x contrast — with the nearest colour that passes.
 * Pure.
 */

/** sRGB, 0–255 per channel, alpha 0–1. */
export type Rgb = { r: number; g: number; b: number; a: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  purple: '#800080',
  yellow: '#ffff00',
  transparent: '#00000000',
};

/** Reads #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla() and a few names. */
export function parseColor(input: string): Rgb | null {
  const text = input.trim().toLowerCase();
  if (NAMED[text]) return parseColor(NAMED[text]);
  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 3) : 1 };
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (!fn) return null;
  const parts = fn[2]!
    .replace(/\s*\/\s*/, ' / ')
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = (value: string | undefined) => {
    if (value === undefined) return 1;
    const n = Number.parseFloat(value);
    if (Number.isNaN(n)) return null;
    return clamp(value.endsWith('%') ? n / 100 : n, 0, 1);
  };
  const a = alpha(parts[3]);
  if (a === null) return null;
  if (fn[1]!.startsWith('rgb')) {
    const channel = (value: string) => {
      const n = Number.parseFloat(value);
      if (Number.isNaN(n)) return null;
      return clamp(value.endsWith('%') ? (n / 100) * 255 : n, 0, 255);
    };
    const [r, g, b] = parts.slice(0, 3).map(channel);
    if (r == null || g == null || b == null) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  }
  const h = Number.parseFloat(parts[0]!);
  const s = Number.parseFloat(parts[1]!);
  const l = Number.parseFloat(parts[2]!);
  if ([h, s, l].some(Number.isNaN)) return null;
  return { ...hslToRgb(h, clamp(s, 0, 100), clamp(l, 0, 100)), a };
}

export function hslToRgb(h: number, s: number, l: number): Omit<Rgb, 'a'> {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + (((h % 360) + 360) % 360) / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: round(l * 100, 1) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return { h: round(h * 60, 1), s: round(s * 100, 1), l: round(l * 100, 1) };
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** OKLCH (CSS Color 4): lightness 0–1, chroma, hue in degrees. */
export function rgbToOklch(color: Rgb): { l: number; c: number; h: number } {
  const [r, g, b] = [toLinear(color.r), toLinear(color.g), toLinear(color.b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  const h = c < 1e-4 ? 0 : ((((Math.atan2(B, A) * 180) / Math.PI) % 360) + 360) % 360;
  return { l: round(L, 3), c: round(c, 3), h: round(h, 1) };
}

const hex2 = (n: number) =>
  Math.round(clamp(n, 0, 255))
    .toString(16)
    .padStart(2, '0');

/** The ways the toolkit writes a colour. */
export function formats(color: Rgb): { label: string; value: string }[] {
  const { h, s, l } = rgbToHsl(color);
  const ok = rgbToOklch(color);
  const alpha = color.a < 1 ? color.a : null;
  return [
    { label: 'HEX', value: toHex(color) },
    {
      label: 'RGB',
      value:
        alpha === null
          ? `rgb(${color.r} ${color.g} ${color.b})`
          : `rgb(${color.r} ${color.g} ${color.b} / ${round(alpha, 2)})`,
    },
    {
      label: 'HSL',
      value:
        alpha === null
          ? `hsl(${round(h)} ${round(s)}% ${round(l)}%)`
          : `hsl(${round(h)} ${round(s)}% ${round(l)}% / ${round(alpha, 2)})`,
    },
    {
      label: 'OKLCH',
      value:
        alpha === null
          ? `oklch(${round(ok.l * 100, 1)}% ${ok.c} ${ok.h})`
          : `oklch(${round(ok.l * 100, 1)}% ${ok.c} ${ok.h} / ${round(alpha, 2)})`,
    },
  ];
}

export function toHex(color: Rgb): string {
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${color.a < 1 ? hex2(color.a * 255) : ''}`;
}

/** WCAG 2.x relative luminance. */
export function luminance(color: Rgb): number {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
}

/** A see-through colour as it shows over a background. */
export function over(top: Rgb, bottom: Rgb): Rgb {
  const a = top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  };
}

/** WCAG 2.x contrast ratio (1–21) of text over a background. */
export function contrastRatio(text: Rgb, background: Rgb): number {
  const bg = background.a < 1 ? over(background, { r: 255, g: 255, b: 255, a: 1 }) : background;
  const fg = text.a < 1 ? over(text, bg) : text;
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastGrade = {
  ratio: number;
  /** Body text: AA needs 4.5, AAA needs 7. */
  aa: boolean;
  aaa: boolean;
  /** Large text (24px, or 18.66px bold): AA needs 3, AAA needs 4.5. */
  aaLarge: boolean;
  aaaLarge: boolean;
};

export function grade(text: Rgb, background: Rgb): ContrastGrade {
  // Judge the unrounded ratio, as the guidelines do (4.499 isn't 4.5).
  const exact = contrastRatio(text, background);
  return {
    ratio: Math.floor(exact * 100) / 100,
    aa: exact >= 4.5,
    aaa: exact >= 7,
    aaLarge: exact >= 3,
    aaaLarge: exact >= 4.5,
  };
}

/**
 * The text colour closest to `text` (same hue and saturation, lightness moved the least) that
 * reaches `target` over `background` — or null if none does.
 */
export function nearestPassing(text: Rgb, background: Rgb, target = 4.5): Rgb | null {
  if (contrastRatio(text, background) >= target) return text;
  const { h, s, l } = rgbToHsl(text);
  for (let step = 0.5; step <= 100; step += 0.5) {
    for (const next of [l - step, l + step]) {
      if (next < 0 || next > 100) continue;
      const candidate = { ...hslToRgb(h, s, next), a: 1 };
      if (contrastRatio(candidate, background) >= target) return candidate;
    }
  }
  return null;
}
