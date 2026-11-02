/**
 * Small developer and type tools for the Toolkit (roadmap P4.6): encode and decode text, read
 * timestamps, test a regular expression, and build a type scale. Pure.
 */

export type Codec = 'base64' | 'url' | 'html';
export const CODECS: { id: Codec; name: string }[] = [
  { id: 'base64', name: 'Base64' },
  { id: 'url', name: 'URL' },
  { id: 'html', name: 'HTML entities' },
];

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

export function encode(text: string, codec: Codec): string {
  if (codec === 'base64') return bytesToBase64(new TextEncoder().encode(text));
  if (codec === 'url') return encodeURIComponent(text);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes, or says why it can't. */
export function decode(
  text: string,
  codec: Codec,
): { ok: true; text: string } | { ok: false; error: string } {
  try {
    if (codec === 'base64') {
      const clean = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
      const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    }
    if (codec === 'url') return { ok: true, text: decodeURIComponent(text.replace(/\+/g, ' ')) };
    return {
      ok: true,
      text: text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
        if (name[0] === '#') {
          const code =
            name[1]?.toLowerCase() === 'x'
              ? parseInt(name.slice(2), 16)
              : parseInt(name.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : match;
        }
        return ENTITIES[name.toLowerCase()] ?? match;
      }),
    };
  } catch {
    return {
      ok: false,
      error:
        codec === 'base64' ? 'That isn’t valid Base64 (or isn’t text)' : 'That can’t be decoded',
    };
  }
}

/** A JWT's header and payload, readable (not verified — the signature needs the secret). */
export function decodeJwt(token: string): { header: unknown; payload: unknown } | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const read = (part: string) => {
    const result = decode(part, 'base64');
    if (!result.ok) return undefined;
    try {
      return JSON.parse(result.text) as unknown;
    } catch {
      return undefined;
    }
  };
  const header = read(parts[0]!);
  const payload = read(parts[1]!);
  return header === undefined || payload === undefined ? null : { header, payload };
}

/**
 * A time as people paste it — Unix seconds or milliseconds, or a date string — as one moment,
 * or null.
 */
export function readTime(input: string): number | null {
  const text = input.trim();
  if (/^-?\d{9,11}$/.test(text)) return Number(text) * 1000;
  if (/^-?\d{12,14}$/.test(text)) return Number(text);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

export function timeViews(at: number): { label: string; value: string }[] {
  const d = new Date(at);
  return [
    { label: 'Unix seconds', value: String(Math.floor(at / 1000)) },
    { label: 'Unix ms', value: String(at) },
    { label: 'ISO 8601 (UTC)', value: d.toISOString() },
    { label: 'Local', value: d.toString().replace(/ GMT.*$/, '') },
  ];
}

export type RegexMatch = { index: number; text: string; groups: string[] };

/** Matches of `pattern` in `text` (at most 200), or why the pattern isn't valid. */
export function testRegex(
  pattern: string,
  flags: string,
  text: string,
): { ok: true; matches: RegexMatch[] } | { ok: false; error: string } {
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const matches: RegexMatch[] = [];
  for (const m of text.matchAll(re)) {
    matches.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1).map((g) => g ?? '') });
    if (matches.length >= 200) break;
    if (m[0] === '' && !flags.includes('g')) break;
  }
  return { ok: true, matches };
}

/** A modular type scale: sizes from `base` by `ratio`, `below` steps down and `above` up. */
export function typeScale(
  base: number,
  ratio: number,
  below = 2,
  above = 5,
): { step: number; px: number; rem: string }[] {
  const out: { step: number; px: number; rem: string }[] = [];
  for (let step = above; step >= -below; step--) {
    const px = Math.round(base * ratio ** step * 100) / 100;
    out.push({ step, px, rem: `${Math.round((px / 16) * 1000) / 1000}rem` });
  }
  return out;
}

export const SCALE_RATIOS = [
  { name: 'Minor third', ratio: 1.2 },
  { name: 'Major third', ratio: 1.25 },
  { name: 'Perfect fourth', ratio: 1.333 },
  { name: 'Golden ratio', ratio: 1.618 },
];
