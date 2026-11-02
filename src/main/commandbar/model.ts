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
  /** A tab in another Space (universal search): that Space's name. */
  space?: string;
};

/** An archived tab matching the query (restored when picked). */
export type ArchivedHit = { id: string; title: string; url: string; favicon: string | null };
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
  /** Your work, searched too (roadmap P1.3, P2.2): projects, tasks, notes and research. */
  work?: WorkHits;
  /** Archived tabs that match (roadmap P2.2). */
  archived?: readonly ArchivedHit[];
  /** Development servers running on this Mac, when the query asks for them (roadmap P3.6). */
  local?: readonly { port: number; url: string; title: string }[];
};

/** "localhost", "local", "127.0.0.1", ":5173", "dev server": the query wants local servers. */
export function wantsLocalServers(query: string): boolean {
  return /^(local|localhost|127\.0\.0\.1|:\d|dev\s*serv|server)/i.test(query.trim());
}

export type WorkHits = {
  projects: readonly { id: string; name: string; description: string }[];
  tasks: readonly {
    id: string;
    title: string;
    projectId: string | null;
    project: string | null;
    done: boolean;
  }[];
  /** Already matched (notes search their whole text). */
  notes: readonly { id: string; title: string; preview: string }[];
  /** Saved findings, already matched. */
  captures?: readonly {
    id: string;
    label: string;
    host: string;
    projectId: string | null;
    project: string | null;
  }[];
};

/** Projects, tasks and notes that match, as results (two of each at most). Pure. */
export function workResults(query: string, work: WorkHits): CommandItem[] {
  const items: CommandItem[] = [];
  for (const p of work.projects
    .filter((p) => matchesAll(query, p.name, p.description))
    .slice(0, 2)) {
    items.push({
      id: `project:${p.id}`,
      kind: 'project',
      title: p.name,
      subtitle: 'Project',
      favicon: null,
      targetId: p.id,
    });
  }
  for (const t of work.tasks
    .filter((t) => matchesAll(query, t.title, t.project ?? ''))
    .sort((a, b) => Number(a.done) - Number(b.done))
    .slice(0, 2)) {
    items.push({
      id: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      subtitle: t.project ? `Task · ${t.project}${t.done ? ' · done' : ''}` : 'Task',
      favicon: null,
      targetId: t.id,
      ...(t.projectId ? { projectId: t.projectId } : {}),
    });
  }
  for (const n of work.notes.slice(0, 2)) {
    items.push({
      id: `note:${n.id}`,
      kind: 'note',
      title: n.title,
      subtitle: n.preview ? `Note · ${n.preview}` : 'Note',
      favicon: null,
      targetId: n.id,
    });
  }
  for (const c of (work.captures ?? []).slice(0, 2)) {
    items.push({
      id: `capture:${c.id}`,
      kind: 'capture',
      title: c.label,
      subtitle: ['Research', c.project ?? 'Unsorted', c.host].filter(Boolean).join(' · '),
      favicon: null,
      targetId: c.id,
      ...(c.projectId ? { projectId: c.projectId } : {}),
    });
  }
  return items;
}

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

  // 1b. Local development servers (roadmap P3.6), narrowed by any port digits typed.
  const digits = /\d{2,5}/.exec(query.replace(/127\.0\.0\.1/, ''))?.[0];
  for (const server of input.local ?? []) {
    if (digits && !String(server.port).startsWith(digits)) continue;
    add({
      id: `local:${server.port}`,
      kind: 'navigate',
      title: server.title,
      subtitle: `Local server · localhost:${server.port}`,
      favicon: null,
      url: server.url,
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

  // 3. Your projects, tasks, notes and research; then archived tabs.
  if (input.work) items.push(...workResults(query, input.work));
  // An archived tab beats a history entry for the same page (it comes back as it was).
  for (const a of (input.archived ?? []).slice(0, 2)) {
    if (seenUrls.some((u) => sameUrl(u, a.url))) continue;
    seenUrls.push(a.url);
    items.push({
      id: `archived:${a.id}`,
      kind: 'archived',
      title: a.title || displayUrl(a.url),
      subtitle: `Archived tab · ${displayUrl(a.url)}`,
      favicon: a.favicon,
      targetId: a.id,
    });
  }

  // 4. Commands.
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
    subtitle: t.space ? `Switch to tab · ${t.space}` : 'Switch to tab',
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
