/**
 * When Orbit AI may open a link by itself (pure; roadmap R2 M2 safety). A page Claude reads can
 * carry hidden instructions; opening an attacker's address with your data in it would leak it.
 * So a link opens directly only when it goes to a site that comes from *you*: named in your
 * words, one of your open tabs or apps, or somewhere you've been — and doesn't carry a long
 * query (where data would travel). Anything else waits in the answer for you to click.
 */

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** "docs.google.com" → "google"; "bbc.co.uk" → "bbc" (good enough for matching words). */
export function siteName(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const secondLevel = /^(co|com|org|net|gov|ac|edu)$/.test(parts.at(-2)!) && parts.length > 2;
  return secondLevel ? parts.at(-3)! : parts.at(-2)!;
}

/** Longest query + fragment a self-opened link may have. */
export const MAX_SELF_OPEN_QUERY = 100;

export function linkNeedsConfirmation(
  url: string,
  from: {
    userWords: string;
    knownUrls: readonly string[];
    visited: (host: string) => boolean;
  },
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (!/^https?:$/.test(parsed.protocol)) return true;
  if (parsed.search.length + parsed.hash.length > MAX_SELF_OPEN_QUERY) return true;
  if (parsed.username || parsed.password) return true;
  const host = hostOf(url);
  if (!host) return true;
  const words = from.userWords.toLowerCase();
  const name = siteName(host);
  const named =
    words.includes(host) || (name.length >= 3 && new RegExp(`\\b${escape(name)}\\b`).test(words));
  if (named) return false;
  if (from.knownUrls.some((known) => hostOf(known) === host)) return false;
  return !from.visited(host);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
