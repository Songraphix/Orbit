/**
 * Tab grouping without AI (roadmap R2 M4), pure: proposes folders for Today's loose tabs from
 * plain signals — the site (with local development servers together), then words their titles
 * share. Nothing moves until the user accepts the preview; this only proposes.
 */

export type GroupTab = { id: string; title: string; url: string };
export type ProposedGroup = {
  /** Stable for the preview (the site or the word it came from). */
  key: string;
  name: string;
  tabIds: string[];
  reason: 'site' | 'topic';
};

/** Fewer loose tabs than this: nothing worth grouping. */
export const GROUP_MIN_TABS = 4;
/** The suggestion chip appears from this many loose Today tabs. */
export const SUGGEST_FROM_TABS = 8;
const MAX_GROUPS = 8;

/** Sites people know by a particular spelling. */
const SITE_NAMES: Record<string, string> = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'youtube.com': 'YouTube',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'mail.google.com': 'Gmail',
  'calendar.google.com': 'Google Calendar',
  'stackoverflow.com': 'Stack Overflow',
  'figma.com': 'Figma',
  'notion.so': 'Notion',
  'linkedin.com': 'LinkedIn',
  'x.com': 'X',
  'twitter.com': 'X',
  'reddit.com': 'Reddit',
  'wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia',
  'amazon.com': 'Amazon',
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'developer.mozilla.org': 'MDN',
};

const STOPWORDS = new Set(
  (
    'the and for with your you from that this what when where which how why are was were will can ' +
    'about into over under more most best new news home page pages index untitled login sign ' +
    'welcome dashboard search results official site free online guide review reviews vs best ' +
    'inbox tab tabs view edit file files docs doc document google com www http https html'
  ).split(' '),
);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isLocal(host: string): boolean {
  return (
    host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || host === '[::1]'
  );
}

/** "news.ycombinator.com" → "Ycombinator"; known sites by their own spelling. Pure. */
export function siteLabel(host: string): string {
  if (isLocal(host)) return 'Local Development';
  if (SITE_NAMES[host]) return SITE_NAMES[host]!;
  const parts = host.split('.');
  const base =
    parts.length > 2 && /^(co|com|org|net|gov|ac)$/.test(parts.at(-2)!)
      ? parts.at(-3)!
      : (parts.at(-2) ?? host);
  const known = Object.entries(SITE_NAMES).find(([h]) => h.split('.')[0] === base);
  if (known) return known[1];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** The grouping key for a site: subdomains of Google's apps stay apart; others by base name. */
function siteKey(host: string): string {
  if (isLocal(host)) return 'local';
  if (SITE_NAMES[host]) return host;
  const parts = host.split('.');
  return parts.length > 2 && /^(co|com|org|net|gov|ac)$/.test(parts.at(-2)!)
    ? parts.slice(-3).join('.')
    : parts.slice(-2).join('.');
}

/** Title words worth grouping by (lower case, 4+ letters, not common or the site's name). */
export function titleWords(title: string, host: string): Set<string> {
  const site = siteLabel(host).toLowerCase();
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w) && !site.includes(w));
  return new Set(words);
}

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Proposed folders: first one per site with 2+ tabs, then for the rest, the title word shared
 * by the most tabs (2+), again and again. Each tab in one folder at most; at most eight
 * folders; tabs that fit none stay as they are. Pure.
 */
export function proposeGroups(tabs: readonly GroupTab[]): ProposedGroup[] {
  if (tabs.length < GROUP_MIN_TABS) return [];
  const groups: ProposedGroup[] = [];
  const used = new Set<string>();

  const bySite = new Map<string, GroupTab[]>();
  for (const tab of tabs) {
    const host = hostOf(tab.url);
    if (!host) continue;
    const key = siteKey(host);
    bySite.set(key, [...(bySite.get(key) ?? []), tab]);
  }
  const sites = [...bySite.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [key, list] of sites) {
    if (groups.length >= MAX_GROUPS) break;
    // A site holding most of the tabs isn't a useful folder: topics can do better.
    if (list.length > tabs.length * 0.6) continue;
    groups.push({
      key: `site:${key}`,
      name: siteLabel(hostOf(list[0]!.url)),
      tabIds: list.map((t) => t.id),
      reason: 'site',
    });
    for (const t of list) used.add(t.id);
  }

  let rest = tabs.filter((t) => !used.has(t.id));
  const words = new Map(rest.map((t) => [t.id, titleWords(t.title, hostOf(t.url))]));
  while (rest.length >= 2 && groups.length < MAX_GROUPS) {
    const counts = new Map<string, string[]>();
    for (const tab of rest) {
      for (const word of words.get(tab.id) ?? [])
        counts.set(word, [...(counts.get(word) ?? []), tab.id]);
    }
    const best = [...counts.entries()]
      .filter(([, ids]) => ids.length >= 2)
      .sort(
        (a, b) =>
          b[1].length - a[1].length || b[0].length - a[0].length || a[0].localeCompare(b[0]),
      )[0];
    if (!best) break;
    const [word, ids] = best;
    groups.push({ key: `topic:${word}`, name: titleCase(word), tabIds: ids, reason: 'topic' });
    const taken = new Set(ids);
    rest = rest.filter((t) => !taken.has(t.id));
  }

  // Names stay unique (a topic may echo a site).
  const seen = new Set<string>();
  for (const group of groups) {
    let name = group.name;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${group.name} ${n}`;
    seen.add(name.toLowerCase());
    group.name = name;
  }
  return groups;
}

/**
 * The folders the user accepted from the preview, made safe: only tabs that are still loose in
 * Today (and named once), names cleaned and unique, folders of fewer than two tabs dropped. Pure.
 */
export function acceptedGroups(
  groups: readonly { name: string; tabIds: readonly string[] }[],
  loose: ReadonlySet<string>,
): { name: string; tabIds: string[] }[] {
  const used = new Set<string>();
  const names = new Set<string>();
  const out: { name: string; tabIds: string[] }[] = [];
  for (const group of groups) {
    const tabIds = group.tabIds.filter((id) => loose.has(id) && !used.has(id));
    if (tabIds.length < 2) continue;
    for (const id of tabIds) used.add(id);
    const base = group.name.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Group';
    let name = base;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    names.add(name.toLowerCase());
    out.push({ name, tabIds });
  }
  return out;
}
