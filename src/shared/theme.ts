import type { SpaceTheme } from './types/space';

/**
 * ThemeEngine (PLAN.md section 5.4): turns a space's theme into the CSS variables the shell
 * paints with. Pure, so contrast rules are unit-tested.
 */
export type ThemeVars = Record<
  | '--sidebar-bg'
  | '--sidebar-fg'
  | '--sidebar-muted'
  | '--hover'
  | '--row-active'
  | '--tile-bg'
  | '--accent'
  | '--grain'
  | '--row-shadow',
  string
>;

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const rgba = ([r, g, b]: Rgb, alpha: number) => `rgb(${r} ${g} ${b} / ${alpha})`;

const DARK_TEXT: Rgb = [29, 29, 31];
const LIGHT_TEXT: Rgb = [242, 242, 247];

/** Picks light or dark text, whichever reads better on the theme's average colour. */
export function textColorFor(colors: readonly string[]): Rgb {
  const rgbs = colors.map(hexToRgb);
  const avg = rgbs
    .reduce<Rgb>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / rgbs.length) as Rgb;
  const soft =
    contrastRatio(avg, LIGHT_TEXT) >= contrastRatio(avg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  if (contrastRatio(avg, soft) >= AA) return soft;
  // Mid-tones: the softer greys can fall short of WCAG AA, pure black or white won't.
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  return contrastRatio(avg, white) >= contrastRatio(avg, black) ? white : black;
}

/** WCAG AA contrast for normal text. */
const AA = 4.5;

/** Light or dark: what Orbit draws in. */
export type ColorMode = 'light' | 'dark';
/** Settings → Appearance: follow the Mac, or always light or dark. */
export type AppAppearance = 'system' | 'light' | 'dark';

/** The mode Orbit draws in: the Appearance setting, or the Mac's own when it's "System". */
export function resolveMode(appearance: AppAppearance, systemDark: boolean): ColorMode {
  if (appearance === 'system') return systemDark ? 'dark' : 'light';
  return appearance;
}

type Hsl = [number, number, number];
function toHsl([r, g, b]: Rgb): Hsl {
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
  return [h, s, l];
}
function fromHsl([h, s, l]: Hsl): Rgb {
  if (s === 0) return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t0: number) => {
    const t = t0 < 0 ? t0 + 1 : t0 > 1 ? t0 - 1 : t0;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [h + 1 / 3, h, h - 1 / 3].map((t) => Math.round(ch(t) * 255)) as Rgb;
}

/**
 * A Space colour on the side of the chosen mode, keeping its hue: in light mode a dark colour
 * becomes a pastel of the same hue, in dark mode a light colour a deep shade. Colours already on
 * that side are kept exactly, so a theme looks as it always did in its own mode.
 */
export function adaptColor(hex: string, mode: ColorMode): Rgb {
  const rgb = hexToRgb(hex);
  const [h, s, l] = toHsl(rgb);
  if (mode === 'light' && l < 0.55) return fromHsl([h, Math.min(s, 0.7), 0.8 + 0.12 * (l / 0.55)]);
  if (mode === 'dark' && l > 0.45)
    return fromHsl([h, Math.min(s, 0.6), 0.1 + 0.14 * ((1 - l) / 0.55)]);
  return rgb;
}

/**
 * The Space's theme in the given mode (Settings → Appearance decides it for the whole app; a
 * theme's own `mode` is only the default when no mode is given).
 */
export function themeToVars(
  theme: SpaceTheme,
  mode: ColorMode = theme.mode === 'light' ? 'light' : 'dark',
): ThemeVars {
  const base: Rgb = mode === 'light' ? [245, 245, 247] : [24, 24, 28];
  // Intensity blends the chosen colours with a neutral base, so low intensity stays calm.
  const tinted = theme.colors.map((c) =>
    mix(base, adaptColor(c, mode), 0.35 + 0.65 * theme.intensity),
  );
  const stops = tinted.map(
    (c, i) => `${rgba(c, 0.72)} ${Math.round((i / Math.max(1, tinted.length - 1)) * 100)}%`,
  );
  const gradient =
    tinted.length === 1 ? rgba(tinted[0]!, 0.72) : `linear-gradient(160deg, ${stops.join(', ')})`;
  const fg = textColorFor(
    tinted.map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`),
  );
  const onDark = luminance(fg) > 0.5;
  const first = hexToRgb(theme.colors[0]!);
  // On a light sidebar the accent is never paler than a mid-tone, so it stands out (Rose, Sky…).
  const [ah, as, al] = toHsl(first);
  const accent =
    mode === 'light' && !onDark
      ? fromHsl([ah, as, Math.min(al * 0.85, 0.45)])
      : mix(first, onDark ? [255, 255, 255] : [0, 0, 0], 0.15);

  return {
    '--sidebar-bg': gradient,
    '--sidebar-fg': rgba(fg, 1),
    '--sidebar-muted': rgba(fg, 0.55),
    '--hover': onDark ? 'rgb(255 255 255 / 0.06)' : 'rgb(0 0 0 / 0.045)',
    '--row-active': onDark ? 'rgb(255 255 255 / 0.13)' : 'rgb(255 255 255 / 0.78)',
    '--tile-bg': onDark ? 'rgb(255 255 255 / 0.075)' : 'rgb(255 255 255 / 0.5)',
    '--accent': rgba(accent, 1),
    '--grain': String(Math.min(0.35, theme.noise * 0.35)),
    // The active row lifts off the sidebar: a lit top edge on dark themes, a soft drop on light.
    '--row-shadow': onDark
      ? '0 1px 2px rgb(0 0 0 / 0.28), inset 0 0.5px 0 rgb(255 255 255 / 0.14)'
      : '0 1px 3px rgb(0 0 0 / 0.1), 0 0 0 0.5px rgb(0 0 0 / 0.05)',
  };
}
