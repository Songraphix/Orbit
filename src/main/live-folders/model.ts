/**
 * Live Folder logic with no Electron imports (F-28): reading RSS / Atom feeds, finding a site's
 * feed, and working out which items a refresh adds and removes.
 */

export type FeedItem = {
  /** Stable id from the source (RSS guid, Atom id, GitHub id), or the link. */
  guid: string;
  title: string;
  url: string;
  /** Epoch ms, when the source gives one. */
  date: number | null;
};

export type Feed = { title: string; items: FeedItem[] };

/** How many items a Live Folder keeps (newest first). */
export const LIVE_FOLDER_LIMIT = 15;

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the XML/HTML entities feeds use. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

/** Text content of an element's inner XML: CDATA unwrapped, tags dropped, entities decoded. */
function textOf(inner: string): string {
  // Real markup (often inside CDATA) is dropped; escaped text like &lt;beta&gt; stays as text.
  const unwrapped = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeTag = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The inner XML of the first `<name>` element in `xml` (namespaced names allowed). */
function inner(xml: string, name: string): string | null {
  const tag = escapeTag(name);
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  return match ? match[1]! : null;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    out[m[1]!.toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? '');
  }
  return out;
}

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function dateOf(text: string | null): number | null {
  if (!text) return null;
  const ms = Date.parse(textOf(text));
  return Number.isFinite(ms) ? ms : null;
}

/** Parses an RSS 2.0 / RSS 1.0 (RDF) / Atom document; null if it isn't a feed. */
export function parseFeed(xml: string, baseUrl: string): Feed | null {
  const isAtom = /<feed[\s>]/i.test(xml);
  const isRss = /<rss[\s>]|<rdf:RDF[\s>]/i.test(xml);
  if (!isAtom && !isRss) return null;

  const blocks = [
    ...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi),
  ].map((m) => m[0]);
  // The feed's own title comes before its first item.
  const head = xml.slice(0, blocks[0] ? xml.indexOf(blocks[0]) : xml.length);
  const title = textOf(inner(head, 'title') ?? '') || new URL(baseUrl).hostname;

  const items: FeedItem[] = [];
  for (const block of blocks) {
    let url: string | null;
    if (isAtom) {
      const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
      const link = links.find((l) => !l['rel'] || l['rel'] === 'alternate') ?? links[0];
      url = link?.['href'] ? absolute(link['href'], baseUrl) : null;
    } else {
      const link = inner(block, 'link');
      url = link ? absolute(textOf(link), baseUrl) : null;
      if (!url) {
        const guid = inner(block, 'guid');
        url = guid ? absolute(textOf(guid), baseUrl) : null;
      }
    }
    if (!url) continue;
    const id = inner(block, isAtom ? 'id' : 'guid');
    items.push({
      guid: (id && textOf(id)) || url,
      title: textOf(inner(block, 'title') ?? '') || url,
      url,
      date: dateOf(
        inner(block, isAtom ? 'updated' : 'pubDate') ??
          inner(block, 'published') ??
          inner(block, 'dc:date'),
      ),
    });
  }
  return { title, items };
}

/** A web page's advertised feed (`<link rel="alternate" type="application/rss+xml">`). */
export function discoverFeedUrl(html: string, baseUrl: string): string | null {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a['rel'] ?? '').toLowerCase().split(/\s+/);
    const type = (a['type'] ?? '').toLowerCase();
    if (rel.includes('alternate') && /application\/(rss|atom)\+xml/.test(type) && a['href']) {
      return absolute(a['href'], baseUrl);
    }
  }
  return null;
}

/** What the user typed for an RSS Live Folder → an http(s) URL, or null. */
export function feedInputUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return absolute(
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
    'https://x/',
  );
}

/** "owner/repo", "github.com/owner/repo" or a repo URL → "owner/repo", or null. */
export function githubRepo(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  // Owners are letters, digits and hyphens; repos may also have dots and underscores.
  const match =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z\d-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i.exec(
      trimmed,
    ) ?? /^([a-z\d-]+)\/([\w.-]+?)(?:\.git)?$/i.exec(trimmed);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** Newest first (undated items keep their feed order), at most `limit`, no duplicate guids. */
export function latest(items: readonly FeedItem[], limit = LIVE_FOLDER_LIMIT): FeedItem[] {
  const seen = new Set<string>();
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.date ?? 0) - (a.item.date ?? 0) || a.index - b.index)
    .map(({ item }) => item)
    .filter((item) => !seen.has(item.guid) && seen.add(item.guid))
    .slice(0, limit);
}

/**
 * A refresh: items to add (newest first) and children to remove. Children that are open as
 * tabs are kept, even when they've dropped out of the feed.
 */
export function planRefresh(
  children: readonly { id: string; guid: string | null; open: boolean }[],
  fetched: readonly FeedItem[],
): { add: FeedItem[]; remove: string[] } {
  const wanted = new Set(fetched.map((f) => f.guid));
  const have = new Set(children.map((c) => c.guid));
  return {
    add: fetched.filter((f) => !have.has(f.guid)),
    remove: children
      .filter((c) => !c.open && (c.guid === null || !wanted.has(c.guid)))
      .map((c) => c.id),
  };
}
