import { getDomain } from 'tldts';
import type { Section } from '../sidebar/model';

/** The site a URL belongs to: its registrable domain (mail.google.com → google.com), or its host
 *  for IPs and single-label hosts. Null for anything that isn't http(s). Pure. */
export function siteOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return getDomain(u.hostname) ?? u.hostname;
  } catch {
    return null;
  }
}

export type PeekRequest = {
  /** Where the link was clicked: Peek is for pinned tabs and favorites. */
  section: Section | null;
  fromUrl: string | null;
  toUrl: string;
  /** Background links (⌘-click) stay background tabs. */
  activate: boolean;
  /** The global setting (Settings → Peek). */
  enabled: boolean;
  /** Which tabs' links Peek: every tab (default) or only pinned tabs and favorites (Arc's way). */
  scope: 'all' | 'pinned';
  /** The source site's own setting ("off" turns Peek off there; Img 3 "Preview"). */
  siteSetting: string | null;
  /** The source site is in Developer Mode (F-30): no Peek there. */
  devMode?: boolean;
};

/**
 * F-23: a link that would open a new tab on another site (an ad on YouTube, a result from a
 * pinned Gmail) opens in a Peek preview over the page instead. With scope 'pinned' only links
 * from pinned tabs and favorites do, like Arc. Same-site links (Gmail → another Gmail view) open
 * as usual. Pure.
 */
export function shouldPeek(r: PeekRequest): boolean {
  if (!r.enabled || !r.activate || r.siteSetting === 'off' || r.devMode) return false;
  if (r.section === null) return false;
  if (r.scope === 'pinned' && r.section !== 'pinned' && r.section !== 'favorite') return false;
  const from = siteOf(r.fromUrl);
  const to = siteOf(r.toUrl);
  return from !== null && to !== null && from !== to;
}
