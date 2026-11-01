import type { Boost, BoostColor, BoostSettings } from '@shared/types/boosts';

/**
 * Boost logic (F-18) with no Electron imports: which Boosts apply to a page, and the CSS a
 * Boost's colour, font and zap tools become.
 */

/**
 * What the user typed in the domain field → the bare host Orbit matches on, or null.
 * "https://www.YouTube.com/watch" → "youtube.com"; '' stays '' (a Boost that matches nothing).
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') return '';
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
      .hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.includes('..')) return null;
  return host.includes('.') || host === 'localhost' ? host : null;
}

/** True when `url` is a web page on `domain` or one of its subdomains. */
export function matchesDomain(domain: string, url: string): boolean {
  if (!domain) return false;
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === domain || host.endsWith(`.${domain}`);
}

/** The enabled Boosts for a page, oldest first (later Boosts win where their CSS overlaps). */
export function boostsFor(boosts: readonly Boost[], url: string): Boost[] {
  return boosts
    .filter((b) => b.enabled && matchesDomain(b.domain, url))
    .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
}

/** The domain a new Boost on this page should match ('' if the page isn't a website). */
export function domainForPage(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return normalizeDomain(parsed.hostname) ?? '';
  } catch {
    return '';
  }
}

/** Media keep their real colours when the page is inverted. */
const MEDIA = 'img, picture, video, canvas, iframe, svg image, embed, object';

export function colorCss(color: BoostColor): string {
  const tint = [
    color.hue !== 0 ? `hue-rotate(${color.hue}deg)` : '',
    color.saturation !== 100 ? `saturate(${color.saturation}%)` : '',
    color.brightness !== 100 ? `brightness(${color.brightness}%)` : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (!color.dark) return tint ? `html { filter: ${tint} !important; }` : '';
  const invert = 'invert(1) hue-rotate(180deg)';
  return [
    // A transparent page would invert to white text on Chromium's white canvas.
    ':where(html) { background-color: #fff; }',
    `html { filter: ${invert}${tint ? ` ${tint}` : ''} !important; }`,
    `${MEDIA} { filter: ${invert} !important; }`,
  ].join('\n');
}

/** Code and icon fonts keep their own faces. */
const FONT_TARGETS =
  'body, body *:not(code, pre, pre *, kbd, samp, i, [class*="icon" i], [class*="material" i], [class*="fa-" i])';

export function fontCss(font: string): string {
  return `${FONT_TARGETS} { font-family: "${font}", system-ui, sans-serif !important; }`;
}

/** One rule per selector, so a selector the browser rejects doesn't void the rest. */
export function zapCss(selectors: readonly string[]): string {
  return selectors.map((s) => `${s} { display: none !important; }`).join('\n');
}

/** Everything a Boost injects as CSS: tools first, then the user's own CSS (which wins ties). */
export function composeCss(boost: Pick<Boost, 'css' | 'settings'>): string {
  const { color, font, zapped }: BoostSettings = boost.settings;
  return [color ? colorCss(color) : '', font ? fontCss(font) : '', zapCss(zapped), boost.css.trim()]
    .filter(Boolean)
    .join('\n');
}

/** Adds a zapped selector once (newest last). */
export function withZapped(settings: BoostSettings, selector: string): BoostSettings {
  if (settings.zapped.includes(selector)) return settings;
  return { ...settings, zapped: [...settings.zapped, selector] };
}

/** "Boost for youtube.com", or plain "Boost" when there's no site. */
export function defaultBoostName(domain: string): string {
  return domain ? `Boost for ${domain}` : 'Boost';
}
