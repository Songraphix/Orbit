import type { CommandBarMode, CommandItem } from '@shared/types/command-bar';
import type { Classified } from '../omnibox/classify';

/**
 * Builds and ranks command bar results (PLAN.md F-21). Pure: the inputs are gathered by the
 * service (open tabs, history, suggestions, commands); this decides what shows and in what order.
 */
export type OpenTab = {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  active: boolean;
};
export type HistoryHit = { url: string; title: string; favicon: string | null };
export type CommandDef = { id: string; title: string; keywords: string[]; shortcut?: string };

export type ResultInput = {
  query: string;
  mode: CommandBarMode;
  classified: Classified | null;
  tabs: readonly OpenTab[];
  history: readonly HistoryHit[];
  suggestions: readonly string[];
  commands: readonly CommandDef[];
  searchUrl: (query: string) => string;
};

const LIMITS = { tabs: 3, commands: 3, history: 5, suggestions: 3, total: 12 } as const;

/** Every query word appears somewhere in the haystack (case-insensitive). */
export function matchesAll(query: string, ...fields: string[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = fields.join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/** Normalises a URL for "is this already open?" comparisons. */
export function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) =>
    u
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '')
      .toLowerCase();
  return norm(a) === norm(b);
}

export function buildResults(input: ResultInput): CommandItem[] {
  const query = input.query.trim();
  const items: CommandItem[] = [];
  const seenUrls: string[] = [];
  const add = (item: CommandItem) => {
    if (item.url && seenUrls.some((u) => sameUrl(u, item.url!))) return;
    if (item.url) seenUrls.push(item.url);
    items.push(item);
  };

  if (!query) {
    // Empty: jump between open tabs, plus a few commands.
    for (const t of input.tabs.filter((t) => !t.active).slice(0, 5)) add(tabItem(t));
    for (const c of input.commands.slice(0, LIMITS.commands)) items.push(commandItem(c));
    return items;
  }

  // 1. The primary action for exactly what was typed.
  if (input.classified?.kind === 'url') {
    add({
      id: `navigate:${input.classified.url}`,
      kind: 'navigate',
      title: displayUrl(input.classified.url),
      subtitle: input.mode === 'edit' ? 'Go to address' : 'Open address',
      favicon: null,
      url: input.classified.url,
    });
  }

  // 2. An open tab with this page beats opening a duplicate (Arc does this).
  const tabMatches = input.tabs.filter((t) => matchesAll(query, t.title, t.url));
  for (const t of tabMatches.slice(0, LIMITS.tabs)) {
    // Not added via `add`: an open tab should be offered even if its URL was typed exactly.
    items.push(tabItem(t));
    seenUrls.push(t.url);
  }

  if (input.classified?.kind === 'search' || !input.classified) {
    const url = input.searchUrl(query);
    items.push({
      id: `search:${query}`,
      kind: 'search',
      title: query,
      subtitle: 'Search Google',
      favicon: null,
      url,
    });
  }

  // 3. Commands.
  for (const c of input.commands
    .filter((c) => matchesAll(query, c.title, ...c.keywords))
    .slice(0, LIMITS.commands)) {
    items.push(commandItem(c));
  }

  // 4. History.
  let historyCount = 0;
  for (const h of input.history) {
    if (historyCount >= LIMITS.history) break;
    const before = items.length;
    add({
      id: `history:${h.url}`,
      kind: 'history',
      title: h.title || displayUrl(h.url),
      subtitle: displayUrl(h.url),
      favicon: h.favicon,
      url: h.url,
    });
    if (items.length > before) historyCount++;
  }

  // 5. Search suggestions.
  for (const s of input.suggestions
    .filter((s) => s.toLowerCase() !== query.toLowerCase())
    .slice(0, LIMITS.suggestions)) {
    items.push({
      id: `suggestion:${s}`,
      kind: 'suggestion',
      title: s,
      subtitle: 'Search Google',
      favicon: null,
      url: input.searchUrl(s),
    });
  }

  return items.slice(0, LIMITS.total);
}

function tabItem(t: OpenTab): CommandItem {
  return {
    id: `tab:${t.id}`,
    kind: 'tab',
    title: t.title || displayUrl(t.url),
    subtitle: 'Switch to tab',
    favicon: t.favicon,
    tabId: t.id,
  };
}

function commandItem(c: CommandDef): CommandItem {
  return {
    id: `command:${c.id}`,
    kind: 'command',
    title: c.title,
    subtitle: c.shortcut ?? 'Command',
    favicon: null,
    commandId: c.id,
  };
}

/** Parses Google's suggest API response: `["query", ["s1", "s2", …], …]`. */
export function parseSuggestions(body: unknown): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  return (body[1] as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 8);
}
