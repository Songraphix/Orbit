/** The new tab page's shortcuts and Today list (owner request). Pure. */

/** Start of the local day `now` falls in. */
export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Today shows what's still to do, and what was done today; older done items drop off. */
export function visibleTodos<T extends { doneAt: number | null; createdAt: number }>(
  todos: readonly T[],
  now: number,
): T[] {
  const today = startOfDay(now);
  return todos
    .filter((t) => t.doneAt === null || t.doneAt >= today)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** A short name for a site from its page title ("Cats - YouTube" → "YouTube"),
 *  falling back to its host ("notion.so" → "Notion"). */
export function shortcutTitle(title: string, url: string): string {
  const parts = title
    .split(/\s+[-|–—·:]\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !p.includes('@'));
  // Site names usually come last ("Cats - YouTube", "Inbox (3) - Gmail").
  const last = parts.at(-1);
  if (last && last.length <= 16) return last;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.').at(-2) ?? host;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return title.slice(0, 16) || 'Site';
  }
}

/** First shortcuts for a profile: its most-visited sites, one per site, home pages only. */
export function seedShortcuts(
  topSites: readonly { url: string; title: string; favicon: string | null }[],
  limit = 6,
): { title: string; url: string; icon: string | null }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string; icon: string | null }[] = [];
  for (const site of topSites) {
    let origin: string;
    try {
      const u = new URL(site.url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      if (u.hostname === 'localhost' || /^[\d.]+$/.test(u.hostname)) continue;
      origin = u.origin;
    } catch {
      continue;
    }
    if (seen.has(origin)) continue;
    seen.add(origin);
    out.push({ title: shortcutTitle(site.title, site.url), url: `${origin}/`, icon: site.favicon });
    if (out.length >= limit) break;
  }
  return out;
}
