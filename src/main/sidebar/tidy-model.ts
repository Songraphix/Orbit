/**
 * Tab housekeeping (roadmap P4.5), pure: which Today tabs repeat a page you already have open,
 * the order Today takes when sorted, and which tabs are from before today.
 */

export type TodayTab = {
  id: string;
  url: string;
  title: string;
  lastActiveAt: number | null;
  createdAt: number;
};

/** A page's address without its #fragment and trailing slash, for "is this the same page". */
export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const text = u.toString();
    return text.endsWith('/') && u.pathname !== '/' ? text.slice(0, -1) : text;
  } catch {
    return url;
  }
}

/**
 * Today tabs that show a page already open elsewhere in the Space: a pinned tab or favorite
 * always wins; among Today tabs, the one used most recently stays.
 */
export function duplicateTabs(today: readonly TodayTab[], kept: readonly string[]): string[] {
  const keep = new Set(kept.map(pageKey));
  const winners = new Map<string, TodayTab>();
  for (const tab of today) {
    const key = pageKey(tab.url);
    if (keep.has(key)) continue;
    const current = winners.get(key);
    if (!current || (tab.lastActiveAt ?? 0) > (current.lastActiveAt ?? 0)) winners.set(key, tab);
  }
  return today
    .filter((tab) => keep.has(pageKey(tab.url)) || winners.get(pageKey(tab.url))?.id !== tab.id)
    .map((tab) => tab.id);
}

export const SORT_TODAY = ['site', 'title', 'recent'] as const;
export type SortToday = (typeof SORT_TODAY)[number];

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Today's tabs in the new order: by site (then title), by title, or most recently used first. */
export function sortToday(tabs: readonly TodayTab[], by: SortToday): string[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const sorted = [...tabs].sort((a, b) => {
    if (by === 'recent') return (b.lastActiveAt ?? b.createdAt) - (a.lastActiveAt ?? a.createdAt);
    if (by === 'site') {
      const site = collator.compare(siteOf(a.url), siteOf(b.url));
      if (site !== 0) return site;
    }
    return collator.compare(a.title, b.title);
  });
  return sorted.map((t) => t.id);
}

/** Today tabs last used before today began (local time) — never the one on screen. */
export function fromBeforeToday(
  tabs: readonly TodayTab[],
  now: number,
  activeId: string | null,
): string[] {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return tabs
    .filter((t) => t.id !== activeId && (t.lastActiveAt ?? t.createdAt) < midnight)
    .map((t) => t.id);
}
