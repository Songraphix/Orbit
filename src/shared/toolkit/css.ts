/**
 * CSS helpers for the Creative Toolkit (roadmap P3.5): px ↔ rem, and box-shadow and gradient
 * builders whose output is ready to paste. Pure.
 */

export function pxToRem(px: number, base = 16): string {
  return `${trim(px / base)}rem`;
}

export function remToPx(rem: number, base = 16): string {
  return `${trim(rem * base)}px`;
}

/** Up to 4 decimals, no trailing zeros. */
export function trim(n: number): string {
  return String(Math.round(n * 10_000) / 10_000);
}

export type Shadow = {
  x: number;
  y: number;
  blur: number;
  spread: number;
  /** #rrggbb */
  color: string;
  /** 0–100 */
  opacity: number;
  inset: boolean;
};

export const DEFAULT_SHADOW: Shadow = {
  x: 0,
  y: 8,
  blur: 24,
  spread: -6,
  color: '#000000',
  opacity: 25,
  inset: false,
};

const hexChannels = (hex: string) => {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '000000';
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
};

export function shadowCss(s: Shadow): string {
  const [r, g, b] = hexChannels(s.color);
  const alpha = Math.round(Math.min(100, Math.max(0, s.opacity))) / 100;
  const parts = [`${s.x}px`, `${s.y}px`, `${Math.max(0, s.blur)}px`, `${s.spread}px`];
  return `${s.inset ? 'inset ' : ''}${parts.join(' ')} rgb(${r} ${g} ${b} / ${alpha})`;
}

export type Gradient = {
  kind: 'linear' | 'radial';
  /** Degrees (linear only). */
  angle: number;
  /** Colour stops, positions 0–100 in order. */
  stops: { color: string; at: number }[];
};

export const DEFAULT_GRADIENT: Gradient = {
  kind: 'linear',
  angle: 135,
  stops: [
    { color: '#8b7bff', at: 0 },
    { color: '#ff7ab6', at: 100 },
  ],
};

export function gradientCss(g: Gradient): string {
  const stops = [...g.stops]
    .sort((a, b) => a.at - b.at)
    .map((s) => `${s.color} ${Math.round(Math.min(100, Math.max(0, s.at)))}%`)
    .join(', ');
  return g.kind === 'linear'
    ? `linear-gradient(${Math.round(g.angle)}deg, ${stops})`
    : `radial-gradient(circle, ${stops})`;
}
