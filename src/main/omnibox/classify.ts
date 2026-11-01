import { parse } from 'tldts';

/**
 * Decides whether what the user typed is an address or a search (PLAN.md F-21).
 * Pure, no Electron imports.
 */
export type Classified = { kind: 'url'; url: string } | { kind: 'search'; url: string };

export const DEFAULT_SEARCH_URL = 'https://www.google.com/search?q=%s';

/** Schemes the user may type directly. `javascript:`, `file:`, `data:` etc. become searches. */
const TYPABLE_SCHEMES = new Set(['http:', 'https:', 'orbit:']);

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d{1,5})?([/?#].*)?$/;
const LOCALHOST = /^localhost(:\d{1,5})?([/?#].*)?$/i;

export function searchUrl(query: string, template = DEFAULT_SEARCH_URL): string {
  return template.replace('%s', encodeURIComponent(query));
}

function tryUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

export function classifyInput(raw: string, searchTemplate = DEFAULT_SEARCH_URL): Classified | null {
  const input = raw.trim();
  if (!input) return null;
  const search = (): Classified => ({ kind: 'search', url: searchUrl(input, searchTemplate) });

  if (HAS_SCHEME.test(input)) {
    const url = tryUrl(input);
    return url && TYPABLE_SCHEMES.has(url.protocol) ? { kind: 'url', url: url.href } : search();
  }
  if (/\s/.test(input)) return search();

  if (LOCALHOST.test(input)) return { kind: 'url', url: new URL(`http://${input}`).href };

  const ip = IPV4.exec(input);
  if (ip) {
    const valid = ip.slice(1, 5).every((octet) => Number(octet) <= 255);
    return valid ? { kind: 'url', url: new URL(`http://${input}`).href } : search();
  }

  const url = tryUrl(`https://${input}`);
  if (!url) return search();
  const host = parse(url.hostname);
  // A real public suffix (e.g. .com, .co.uk) with a registrable domain in front of it.
  if (host.isIcann && host.domain && !host.isIp) return { kind: 'url', url: url.href };
  return search();
}
