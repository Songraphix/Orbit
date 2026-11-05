import { contrastRatio, hexToRgb, luminance } from './theme';

/**
 * The wallpaper-reactive theme (UI spec §4). A small palette is taken from the wallpaper on this
 * Mac (a built-in's CSS, a colour, a gradient, or a tiny thumbnail of a photo) and turned into
 * the tokens every surface paints with: the canvas tone, an accent and a second accent, four
 * tiers of glass and their borders, highlights and shadows, and text colours that stay readable
 * (contrast is checked against the wallpaper's average, with headroom). Pure and unit-tested.
 */

type Rgb = [number, number, number];

export type Swatch = { hex: string; weight: number };
export type Palette = { swatches: Swatch[]; average: string };

export const GLASS_LEVELS = ['subtle', 'balanced', 'strong'] as const;
export type GlassLevel = (typeof GLASS_LEVELS)[number];

export type CanvasTheme = {
  /** What the wallpaper is like overall: light glass and dark text, or the other way round. */
  tone: 'light' | 'dark';
  accent: string;
  accent2: string;
  average: string;
  /** CSS custom properties (see tokens.css for what each one paints). */
  vars: Record<string, string>;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${Math.round(alpha * 1000) / 1000})`;

type Hsl = [number, number, number];
export function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}
export function hslToRgb([h, s, l]: Hsl): Rgb {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t0: number) => {
    const t = t0 < 0 ? t0 + 1 : t0 > 1 ? t0 - 1 : t0;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(hh + 1 / 3) * 255, ch(hh) * 255, ch(hh - 1 / 3) * 255];
}

// ─── Palettes ────────────────────────────────────────────────────────────────────────────────

/** Parses one CSS colour (#rgb, #rrggbb, rgb()/rgba() in either syntax); null if it isn't one. */
export function parseColor(text: string): { rgb: Rgb; alpha: number } | null {
  const t = text.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (short)
    return {
      rgb: hexToRgb(`#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`),
      alpha: 1,
    };
  if (/^#[0-9a-f]{6}$/.test(t)) return { rgb: hexToRgb(t), alpha: 1 };
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(
    t,
  );
  if (!fn) return null;
  const a =
    fn[4] === undefined ? 1 : fn[4].endsWith('%') ? Number.parseFloat(fn[4]) / 100 : Number(fn[4]);
  return { rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])], alpha: clamp01(a) };
}

const COLOR_RE = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi;

/**
 * A palette from a CSS background: soft radial "fields" (`radial-gradient(at x% y%, colour 0px,
 * transparent n%)`) weigh by their size and opacity; everything else is the base, shared
 * evenly. The average lays the fields over the base the way the browser would. Pure.
 */
export function paletteFromCss(css: string): Palette {
  const fields: { rgb: Rgb; weight: number }[] = [];
  const FIELD =
    /radial-gradient\(\s*at[^,]*,\s*(#[0-9a-f]{3,6}|rgba?\([^)]*\))\s+0(?:px)?\s*,\s*transparent\s+([\d.]+)%\s*\)/gi;
  let rest = css;
  for (const m of css.matchAll(FIELD)) {
    const c = parseColor(m[1]!);
    if (!c) continue;
    const size = Number(m[2]) / 100;
    // A field fades linearly to nothing at its size: about a third of a disc of that radius.
    fields.push({ rgb: c.rgb, weight: clamp01(0.33 * Math.PI * size * size * 0.5 * c.alpha) });
    rest = rest.replace(m[0], '');
  }
  const base = (rest.match(COLOR_RE) ?? [])
    .map(parseColor)
    .filter((c): c is NonNullable<typeof c> => !!c);
  const baseRgb: Rgb[] = base.length ? base.map((c) => c.rgb) : [[24, 24, 28]];
  let average: Rgb = baseRgb
    .reduce<Rgb>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / baseRgb.length) as Rgb;
  for (const f of fields) average = mix(average, f.rgb, Math.min(0.6, f.weight));
  const fieldShare = Math.min(
    0.7,
    fields.reduce((s, f) => s + f.weight, 0),
  );
  const swatches: Swatch[] = [
    ...baseRgb.map((c) => ({ hex: toHex(c), weight: (1 - fieldShare) / baseRgb.length })),
    ...fields.map((f) => ({
      hex: toHex(f.rgb),
      weight:
        fieldShare *
        (f.weight /
          Math.max(
            1e-6,
            fields.reduce((s, x) => s + x.weight, 0),
          )),
    })),
  ];
  return { swatches: merge(swatches), average: toHex(average) };
}

/**
 * A palette from pixels (a small thumbnail, RGBA or BGRA rows): colours are bucketed (4 bits a
 * channel), the biggest buckets kept, near neighbours merged. Transparent pixels are skipped.
 */
export function paletteFromPixels(
  data: Uint8Array,
  width: number,
  height: number,
  order: 'rgba' | 'bgra' = 'rgba',
): Palette {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const sum: Rgb = [0, 0, 0];
  const [ri, bi] = order === 'rgba' ? [0, 2] : [2, 0];
  for (let i = 0; i + 3 < Math.min(data.length, width * height * 4); i += 4) {
    if (data[i + 3]! < 128) continue;
    const r = data[i + ri]!;
    const g = data[i + 1]!;
    const b = data[i + bi]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    total += 1;
  }
  if (total === 0) return { swatches: [{ hex: '#18181c', weight: 1 }], average: '#18181c' };
  const swatches = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 48)
    .map((b) => ({ hex: toHex([b.r / b.n, b.g / b.n, b.b / b.n]), weight: b.n / total }));
  return {
    swatches: merge(swatches).slice(0, 8),
    average: toHex(sum.map((v) => v / total) as Rgb),
  };
}

/** Merges swatches closer than `distance` (RGB), keeping the heavier one's colour. */
function merge(swatches: Swatch[], distance = 28): Swatch[] {
  const out: { rgb: Rgb; hex: string; weight: number }[] = [];
  for (const s of [...swatches].sort((a, b) => b.weight - a.weight)) {
    const rgb = hexToRgb(s.hex);
    const near = out.find(
      (o) => Math.hypot(o.rgb[0] - rgb[0], o.rgb[1] - rgb[1], o.rgb[2] - rgb[2]) < distance,
    );
    if (near) near.weight += s.weight;
    else out.push({ rgb, hex: s.hex, weight: s.weight });
  }
  return out
    .sort((a, b) => b.weight - a.weight)
    .map(({ hex, weight }) => ({ hex, weight: Math.round(weight * 1000) / 1000 }));
}

/** A palette for one or more plain colours (a colour wallpaper, a gradient's two ends). */
export function paletteFromColors(colors: string[]): Palette {
  const rgbs = colors.map(hexToRgb);
  const average = rgbs
    .reduce<Rgb>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / rgbs.length) as Rgb;
  return {
    swatches: merge(colors.map((hex) => ({ hex: hex.toLowerCase(), weight: 1 / colors.length }))),
    average: toHex(average),
  };
}

// ─── Accents ─────────────────────────────────────────────────────────────────────────────────

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** How well a swatch would work as an accent: lively, mid-light, and actually present. */
function accentScore({ hex, weight }: Swatch): number {
  const [, s, l] = rgbToHsl(hexToRgb(hex));
  if (s < 0.22 || l < 0.12 || l > 0.92) return 0;
  return s * (1 - Math.min(1, Math.abs(l - 0.56) * 1.6)) * (0.3 + Math.sqrt(weight));
}

/** Makes a colour usable as an accent: enough colour, mid lightness. */
function tameAccent(rgb: Rgb): Rgb {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, Math.max(0.42, Math.min(0.78, s)), Math.max(0.42, Math.min(0.64, l))]);
}

/** The accent and a second accent from a palette (a calm blue-grey when nothing is lively). */
export function pickAccents(palette: Palette): { accent: string; accent2: string } {
  const ranked = palette.swatches
    .map((s) => ({ s, score: accentScore(s), hue: rgbToHsl(hexToRgb(s.hex))[0] }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const first = ranked[0];
  if (!first) {
    const [h, s] = rgbToHsl(hexToRgb(palette.average));
    const accent = hslToRgb([s > 0.08 ? h : 212, 0.36, 0.52]);
    return {
      accent: toHex(accent),
      accent2: toHex(hslToRgb([(s > 0.08 ? h : 212) + 40, 0.36, 0.56])),
    };
  }
  const accent = tameAccent(hexToRgb(first.s.hex));
  const second = ranked.find((x) => hueGap(x.hue, first.hue) > 35);
  const accent2 = second
    ? tameAccent(hexToRgb(second.s.hex))
    : hslToRgb([first.hue + 42, rgbToHsl(accent)[1], rgbToHsl(accent)[2]]);
  return { accent: toHex(accent), accent2: toHex(accent2) };
}

// ─── Glass ───────────────────────────────────────────────────────────────────────────────────

const WHITE: Rgb = [255, 255, 255];
const DARK_FG: Rgb = [24, 26, 32];
const LIGHT_FG: Rgb = [246, 247, 250];

/** The four glass tiers (UI spec §3): white veil and dark scrim per level, for each tone. */
const TIERS = ['light', 'standard', 'deep', 'elevated'] as const;
type Tier = (typeof TIERS)[number];
const VEIL: Record<
  'dark' | 'light',
  Record<GlassLevel, Record<Tier, [veil: number, scrim: number]>>
> = {
  // Over a dark wallpaper: a pale frost with a little of the wallpaper's own depth under it.
  dark: {
    strong: {
      light: [0.1, 0.04],
      standard: [0.13, 0.08],
      deep: [0.15, 0.16],
      elevated: [0.18, 0.3],
    },
    balanced: {
      light: [0.12, 0.08],
      standard: [0.15, 0.14],
      deep: [0.16, 0.26],
      elevated: [0.18, 0.42],
    },
    subtle: {
      light: [0.13, 0.18],
      standard: [0.15, 0.28],
      deep: [0.16, 0.42],
      elevated: [0.17, 0.58],
    },
  },
  // Over a light wallpaper: milky glass.
  light: {
    strong: { light: [0.26, 0], standard: [0.34, 0], deep: [0.46, 0], elevated: [0.6, 0] },
    balanced: { light: [0.34, 0], standard: [0.44, 0], deep: [0.58, 0], elevated: [0.72, 0] },
    subtle: { light: [0.46, 0], standard: [0.58, 0], deep: [0.72, 0], elevated: [0.84, 0] },
  },
};

/** Two layers (a scrim, then a white veil) as one colour and opacity. */
function layer(scrim: Rgb, s: number, veil: number): { rgb: Rgb; alpha: number } {
  const alpha = 1 - (1 - s) * (1 - veil);
  if (alpha <= 0) return { rgb: WHITE, alpha: 0 };
  const rgb = [0, 1, 2].map((i) => (scrim[i]! * s * (1 - veil) + 255 * veil) / alpha) as Rgb;
  return { rgb, alpha };
}

/** What a glass colour looks like over the wallpaper's average. */
const over = (base: Rgb, glass: { rgb: Rgb; alpha: number }): Rgb =>
  hexToRgb(toHex(mix(base, glass.rgb, glass.alpha)));

/** Text on glass should reach this against the average (a margin over AA 4.5; the blur evens out
 *  busy spots). */
export const GLASS_CONTRAST = 4.6;

/**
 * The theme for a palette: tone, accents, and every glass token. `accent` overrides the
 * wallpaper's own (Settings → Appearance → Accent). Pure.
 */
export function canvasTheme(
  palette: Palette,
  options: {
    glass?: GlassLevel;
    accent?: string | null;
    /** Glass without the wallpaper's hue (Automatic palette off). */
    neutral?: boolean;
    /** Light or dark glass whatever the wallpaper (then Light / Dark appearance decides). */
    tone?: 'light' | 'dark';
  } = {},
): CanvasTheme {
  const level = options.glass ?? 'balanced';
  const avg = hexToRgb(palette.average);
  // Light text if it reads at least as well as dark text (wallpapers are usually mid-dark).
  const tone: 'light' | 'dark' =
    options.tone ??
    (contrastRatio(avg, LIGHT_FG) >= contrastRatio(avg, DARK_FG) * 0.8 ? 'dark' : 'light');
  const fg = tone === 'dark' ? LIGHT_FG : DARK_FG;
  const picked = pickAccents(palette);
  const accent = options.accent ?? picked.accent;
  const accentRgb = hexToRgb(accent);
  // The scrim is the wallpaper's own depth (its average, much darker), so glass stays in key.
  const [ah, as0] = rgbToHsl(avg);
  // Neutral (Automatic palette off): glass without the wallpaper's hue.
  const as = options.neutral ? 0 : as0;
  const scrim = hslToRgb([ah, Math.min(0.6, as * 1.15), 0.13]);

  const vars: Record<string, string> = {};
  const solids: Record<string, Rgb> = {};
  for (const tier of TIERS) {
    let [veil, s] = VEIL[tone][level][tier];
    let glass = layer(scrim, s, veil);
    const target = tier === 'light' ? 3.2 : GLASS_CONTRAST;
    // Not readable enough over this wallpaper: more scrim (dark tone) or more veil (light).
    for (let i = 0; contrastRatio(over(avg, glass), fg) < target && i < 16; i++) {
      if (tone === 'dark') s = Math.min(0.9, s + 0.05);
      else veil = Math.min(0.94, veil + 0.04);
      glass = layer(scrim, s, veil);
    }
    vars[`--glass-${tier}`] = rgba(glass.rgb, glass.alpha);
    solids[tier] = over(avg, glass);
  }
  // Solid fallback (Reduce Transparency, Orbit's Solid surfaces): the same colours, opaque.
  for (const tier of TIERS) vars[`--solid-${tier}`] = toHex(solids[tier]!);

  const dark = tone === 'dark';
  const shadow = hslToRgb([ah, Math.min(0.45, as), 0.06]);
  const accentSoft = mix(accentRgb, WHITE, dark ? 0.18 : 0.05);
  Object.assign(vars, {
    '--fg': rgba(fg, 1),
    '--fg-muted': rgba(fg, dark ? 0.72 : 0.66),
    '--fg-faint': rgba(fg, dark ? 0.5 : 0.46),
    '--glass-border': dark ? 'rgb(255 255 255 / 0.16)' : 'rgb(255 255 255 / 0.62)',
    '--glass-edge': dark ? 'rgb(0 0 0 / 0.18)' : 'rgb(0 0 0 / 0.07)',
    '--glass-highlight': dark ? 'rgb(255 255 255 / 0.2)' : 'rgb(255 255 255 / 0.85)',
    '--glass-shadow': `0 14px 34px -16px ${rgba(shadow, dark ? 0.6 : 0.32)}, 0 2px 8px -3px ${rgba(shadow, dark ? 0.3 : 0.14)}`,
    '--glass-hover': dark ? 'rgb(255 255 255 / 0.09)' : 'rgb(255 255 255 / 0.45)',
    '--glass-press': dark ? 'rgb(255 255 255 / 0.14)' : 'rgb(255 255 255 / 0.62)',
    '--sel-bg': rgba(accentSoft, dark ? 0.42 : 0.28),
    '--sel-border': dark ? 'rgb(255 255 255 / 0.3)' : rgba(accentRgb, 0.35),
    '--sel-glow': `0 6px 18px -8px ${rgba(accentRgb, 0.7)}`,
    '--icon': rgba(fg, dark ? 0.86 : 0.78),
    '--focus-ring': rgba(mix(accentRgb, WHITE, dark ? 0.35 : 0), 0.9),
    '--canvas-accent': accent,
    '--canvas-accent-2': picked.accent2,
    '--canvas-average': palette.average,
    '--glass-blur': level === 'strong' ? '30px' : level === 'subtle' ? '18px' : '24px',
  });
  return { tone, accent, accent2: picked.accent2, average: palette.average, vars };
}

/**
 * A palette as it looks after your adjustments: brightness scales it, and photos' dark veil
 * (overlay %) darkens it. (Blur, saturation and contrast barely move the average.) Pure.
 */
export function lookPalette(
  palette: Palette,
  look: { brightness: number; overlay: number },
  photo: boolean,
): Palette {
  const k = look.brightness / 100;
  const veil = photo ? look.overlay / 100 : 0;
  const adjust = (hex: string) =>
    toHex(mix(hexToRgb(hex).map((v) => v * k) as Rgb, [0, 0, 0], veil));
  if (k === 1 && veil === 0) return palette;
  return {
    swatches: palette.swatches.map((s) => ({ hex: adjust(s.hex), weight: s.weight })),
    average: adjust(palette.average),
  };
}

/** The tone of a palette's average alone (for quick checks). */
export const paletteLuminance = (palette: Palette) => luminance(hexToRgb(palette.average));
