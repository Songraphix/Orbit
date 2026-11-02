import { hslToRgb, rgbToHsl, toHex } from './color';
import type { Rgb } from './color';

/**
 * Palettes for the Toolkit's Colors (owner request): colour-wheel harmonies from one colour,
 * and the main colours of an image. Pure, so they're unit-tested.
 */

export const HARMONIES = [
  'analogous',
  'complementary',
  'split',
  'triadic',
  'tetradic',
  'monochrome',
  'shades',
] as const;
export type Harmony = (typeof HARMONIES)[number];

export const HARMONY_LABEL: Record<Harmony, string> = {
  analogous: 'Analogous',
  complementary: 'Complementary',
  split: 'Split',
  triadic: 'Triadic',
  tetradic: 'Tetradic',
  monochrome: 'Monochrome',
  shades: 'Shades',
};

const wrap = (h: number) => ((h % 360) + 360) % 360;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex = (h: number, s: number, l: number) =>
  toHex({ ...hslToRgb(wrap(h), clamp(s, 0, 100), clamp(l, 0, 100)), a: 1 });

/** Five colours in harmony with `base` (the base is always one of them). */
export function harmony(color: Rgb, mode: Harmony): string[] {
  const base = { ...color, a: 1 };
  const { h, s, l } = rgbToHsl(base);
  // Softer and deeper companions keep a palette usable (backgrounds, text, accents).
  const lighter = clamp(l + 22, 0, 94);
  const darker = clamp(l - 22, 8, 100);
  switch (mode) {
    case 'analogous':
      return [
        hex(h - 30, s, l),
        hex(h - 15, s, l),
        toHex(base),
        hex(h + 15, s, l),
        hex(h + 30, s, l),
      ];
    case 'complementary':
      return [
        hex(h, s, darker),
        toHex(base),
        hex(h, s * 0.35, lighter),
        hex(h + 180, s, l),
        hex(h + 180, s, darker),
      ];
    case 'split':
      return [
        toHex(base),
        hex(h, s, lighter),
        hex(h + 150, s, l),
        hex(h + 210, s, l),
        hex(h + 210, s, darker),
      ];
    case 'triadic':
      return [
        toHex(base),
        hex(h, s, darker),
        hex(h + 120, s, l),
        hex(h + 240, s, l),
        hex(h + 240, s, lighter),
      ];
    case 'tetradic':
      return [
        toHex(base),
        hex(h + 90, s, l),
        hex(h + 180, s, l),
        hex(h + 270, s, l),
        hex(h, s * 0.3, lighter),
      ];
    case 'monochrome':
      return [hex(h, s, 18), hex(h, s, 34), toHex(base), hex(h, s * 0.8, 72), hex(h, s * 0.6, 90)];
    case 'shades':
      return [0.2, 0.4, 0.6, 0.8]
        .map((f) => hex(h, s, l * f))
        .concat(toHex(base))
        .reverse();
  }
}

/** A random, pleasant base colour (avoids muddy and neon extremes). */
export function randomBase(random: () => number = Math.random): Rgb {
  return {
    ...hslToRgb(Math.floor(random() * 360), 55 + random() * 30, 45 + random() * 15),
    a: 1,
  };
}

/** Palette → CSS custom properties (`--color-1: #…;`). */
export function paletteCss(colors: readonly string[]): string {
  return `:root {\n${colors.map((c, i) => `  --color-${i + 1}: ${c};`).join('\n')}\n}`;
}

/**
 * The main colours of an image: RGBA pixels (from a canvas) → up to `count` colours, most
 * common first. A small k-means on a sample of opaque pixels, seeded evenly through the
 * brightness range so the result is the same every time.
 */
export function extractPalette(pixels: ArrayLike<number>, count = 6): string[] {
  const points: [number, number, number][] = [];
  const total = Math.floor(pixels.length / 4);
  const stride = Math.max(1, Math.floor(total / 4000));
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if ((pixels[o + 3] ?? 0) < 128) continue;
    points.push([pixels[o]!, pixels[o + 1]!, pixels[o + 2]!]);
  }
  if (points.length === 0) return [];
  const k = Math.min(count, points.length);
  // Seeds: the middle-brightness pixel, then each time the pixel farthest from every seed so
  // far — distinct colours each get a cluster, and the result is the same every time.
  const dist = (a: readonly number[], b: readonly number[]) =>
    (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
  const bright = (p: readonly number[]) => p[0]! * 0.3 + p[1]! * 0.59 + p[2]! * 0.11;
  const sorted = [...points].sort((a, b) => bright(a) - bright(b));
  let centres: [number, number, number][] = [[...sorted[Math.floor(sorted.length / 2)]!]];
  const nearest = points.map((p) => dist(p, centres[0]!));
  while (centres.length < k) {
    let far = 0;
    for (let i = 1; i < points.length; i++) if (nearest[i]! > nearest[far]!) far = i;
    if (nearest[far] === 0) break; // fewer distinct colours than asked for
    const seed = [...points[far]!] as [number, number, number];
    centres.push(seed);
    points.forEach((p, i) => (nearest[i] = Math.min(nearest[i]!, dist(p, seed))));
  }
  let sizes: number[] = [];
  for (let round = 0; round < 12; round++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let best = 0;
      let bestDist = Infinity;
      centres.forEach((c, i) => {
        const d = dist(p, c);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      const sum = sums[best]!;
      sum[0]! += p[0];
      sum[1]! += p[1];
      sum[2]! += p[2];
      sum[3]! += 1;
    }
    sizes = sums.map((s) => s[3]!);
    centres = sums.map((s, i) =>
      s[3] ? [s[0]! / s[3], s[1]! / s[3], s[2]! / s[3]] : centres[i]!,
    ) as [number, number, number][];
  }
  const seen = new Set<string>();
  return centres
    .map((c, i) => ({
      hex: toHex({ r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), a: 1 }),
      size: sizes[i] ?? 0,
    }))
    .filter((c) => c.size > 0)
    .sort((a, b) => b.size - a.size)
    .map((c) => c.hex)
    .filter((h) => (seen.has(h) ? false : (seen.add(h), true)));
}
