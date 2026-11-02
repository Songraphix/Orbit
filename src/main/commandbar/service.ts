import { clipboard, net } from 'electron';
import type { CommandBarMode, CommandItem } from '@shared/types/command-bar';
import { classifyInput, searchUrl } from '../omnibox/classify';
import type { HistoryRepository } from '../persistence/repositories/history';
import type { WindowController } from '../windows/window-manager';
import { buildResults, parseSuggestions, sameUrl, wantsLocalServers } from './model';
import type { ArchivedHit, CommandDef, OpenTab, WorkHits } from './model';

/** Commands the bar can run (F-21). Each also has a menu shortcut, shown as the subtitle. */
export const COMMANDS: readonly CommandDef[] = [
  { id: 'new-tab-page', title: 'New Tab Page', keywords: ['wallpaper', 'home'] },
  { id: 'toggle-sidebar', title: 'Toggle Sidebar', keywords: ['hide', 'show'], shortcut: '⌘S' },
  {
    id: 'toggle-tabs-top',
    title: 'Toggle Tabs on Top',
    keywords: ['horizontal', 'tab strip', 'tab bar', 'layout', 'vertical', 'chrome'],
  },
  { id: 'copy-url', title: 'Copy URL', keywords: ['link', 'address'], shortcut: '⇧⌘C' },
  { id: 'reload', title: 'Reload Page', keywords: ['refresh'], shortcut: '⌘R' },
  { id: 'close-tab', title: 'Close Tab', keywords: ['remove'], shortcut: '⌘W' },
  { id: 'reopen-tab', title: 'Reopen Closed Tab', keywords: ['undo', 'restore'], shortcut: '⇧⌘T' },
  { id: 'import-arc', title: 'Import from Arc…', keywords: ['arc', 'migrate', 'bookmarks'] },
  { id: 'new-space', title: 'New Space', keywords: ['workspace'] },
  {
    id: 'split-view',
    title: 'New Split View',
    keywords: ['side by side', 'pane'],
    shortcut: '⌃⇧=',
  },
  { id: 'exit-split', title: 'Exit Split View', keywords: ['side by side', 'pane', 'unsplit'] },
  { id: 'swap-split', title: 'Swap Split Panes', keywords: ['side by side', 'pane'] },
  {
    id: 'live-rss',
    title: 'Add RSS Live Folder…',
    keywords: ['feed', 'blog', 'news', 'subscribe'],
  },
  {
    id: 'live-pulls',
    title: 'Add GitHub Pull Requests Live Folder…',
    keywords: ['github', 'pr', 'review'],
  },
  { id: 'live-issues', title: 'Add GitHub Issues Live Folder…', keywords: ['github', 'bugs'] },
  { id: 'live-refresh', title: 'Refresh Live Folders', keywords: ['feed', 'update'] },
  {
    id: 'library',
    title: 'Library',
    keywords: ['media', 'downloads', 'easels', 'spaces', 'boosts'],
    shortcut: '⌥⌘L',
  },
  {
    id: 'new-easel',
    title: 'New Easel',
    keywords: ['canvas', 'draw', 'notes', 'whiteboard'],
    shortcut: '⌃⇧E',
  },
  {
    id: 'focus-start',
    title: 'Start Focus',
    keywords: ['focus', 'pomodoro', 'timer', 'deep work', 'concentrate', 'task'],
  },
  { id: 'focus-end', title: 'End Focus', keywords: ['focus', 'stop', 'timer'] },
  {
    id: 'capture',
    title: 'Save to Orbit…',
    keywords: ['capture', 'clip', 'research', 'save', 'snippet', 'screenshot', 'bookmark'],
    shortcut: '⇧⌘S',
  },
  {
    id: 'quick-note',
    title: 'Quick Note',
    keywords: ['notes', 'write', 'jot', 'memo', 'scratch'],
    shortcut: '⌃⇧N',
  },
  { id: 'new-note', title: 'New Note', keywords: ['notes', 'write', 'memo', 'tab'] },
  {
    id: 'toggle-notes',
    title: 'Toggle Notes',
    keywords: ['notes', 'panel', 'sidebar', 'notepad'],
    shortcut: '⇧⌘N',
  },
  {
    id: 'float-note',
    title: 'New Floating Note',
    keywords: ['notes', 'sticky', 'window', 'pin', 'on top'],
  },
  {
    id: 'assistant',
    title: 'Ask Orbit',
    keywords: ['ai', 'assistant', 'claude', 'chat', 'question', 'ask'],
    shortcut: '⌘J',
  },
  {
    id: 'summarize-page',
    title: 'Summarize Page',
    keywords: ['ai', 'summary', 'tldr', 'claude', 'read', 'digest'],
  },
  {
    id: 'toolkit',
    title: 'Toolkit',
    keywords: ['colors', 'colours', 'contrast', 'css', 'json', 'developer', 'design', 'tools'],
  },
  {
    id: 'pick-color',
    title: 'Pick Color',
    keywords: ['eyedropper', 'colour', 'hex', 'picker', 'design'],
    shortcut: '⌃⇧C',
  },
  {
    id: 'responsive',
    title: 'Responsive Design Mode',
    keywords: ['mobile', 'device', 'viewport', 'iphone', 'ipad', 'responsive', 'developer'],
    shortcut: '⌥⌘R',
  },
  {
    id: 'annotate-screenshot',
    title: 'Annotate Screenshot',
    keywords: ['markup', 'draw', 'arrow', 'screenshot', 'easel', 'annotate'],
  },
  {
    id: 'format-json',
    title: 'Format JSON',
    keywords: ['json', 'prettify', 'minify', 'validate', 'developer'],
  },
  { id: 'new-boost', title: 'New Boost', keywords: ['css', 'customise', 'customize', 'style'] },
  { id: 'archived-tabs', title: 'Archived Tabs', keywords: ['archive', 'closed', 'history'] },
  { id: 'settings', title: 'Settings', keywords: ['preferences', 'options'], shortcut: '⌘,' },
];

const SUGGEST_TIMEOUT_MS = 700;

export type CommandRunner = (controller: WindowController, commandId: string) => void;

/** Gathers results for the bar and carries out what the user picks. */
export class CommandBarService {
  constructor(
    private readonly history: HistoryRepository,
    private readonly runCommand: CommandRunner,
    /** Tests and offline use turn off network suggestions. */
    private readonly suggestionsEnabled = true,
    /** Projects, tasks, notes and research matching a query (roadmap P1.3, P2.2). */
    private readonly work?: (query: string) => WorkHits,
    /** Archived tabs matching a query (roadmap P2.2). */
    private readonly archived?: (query: string) => ArchivedHit[],
    /** Development servers on this Mac (roadmap P3.6), when the query asks for them. */
    private readonly local?: () => Promise<{ port: number; url: string; title: string }[]>,
  ) {}

  /** Universal search: typing also finds tabs in your other Spaces (picking one goes there). */
  private otherSpaceTabs(controller: WindowController): OpenTab[] {
    const { store } = controller;
    const here = controller.tabs.space.id;
    const seen = new Set<string>();
    const tabs: OpenTab[] = [];
    for (const space of store.spaces) {
      if (space.id === here) continue;
      for (const item of store.tabsInOrder(space)) {
        // Favorites belong to every space of a profile: they're already in this one's list.
        if (item.spaceId === null || seen.has(item.id) || !item.url) continue;
        seen.add(item.id);
        tabs.push({
          id: item.id,
          title: item.titleOverride || item.title || item.url,
          url: item.url,
          favicon: item.favicon,
          active: false,
          space: space.name,
        });
      }
    }
    return tabs;
  }

  async query(controller: WindowController, query: string): Promise<CommandItem[]> {
    const mode: CommandBarMode = controller.overlay.mode ?? 'new';
    const trimmed = query.trim();
    const snapshot = controller.tabs.snapshot();
    const [history, suggestions, local] = await Promise.all([
      Promise.resolve(trimmed ? this.history.search(trimmed, 10) : []),
      this.suggest(trimmed),
      this.local && wantsLocalServers(trimmed) ? this.local().catch(() => []) : Promise.resolve([]),
    ]);
    return buildResults({
      query: trimmed,
      mode,
      classified: classifyInput(trimmed),
      tabs: [
        ...snapshot.tabs.map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          favicon: t.favicon,
          active: t.id === snapshot.activeTabId,
        })),
        ...(trimmed ? this.otherSpaceTabs(controller) : []),
      ],
      history,
      suggestions,
      commands: COMMANDS,
      searchUrl,
      ...(trimmed && this.work ? { work: this.work(trimmed) } : {}),
      ...(trimmed && this.archived ? { archived: this.archived(trimmed) } : {}),
      local,
    });
  }

  /** `split` (⌥⏎, roadmap P2.4): a tab or an address opens beside the current page. */
  execute(controller: WindowController, item: CommandItem, split = false): void {
    const mode = controller.overlay.mode ?? 'new';
    controller.overlay.close();
    const { tabs } = controller;

    if (item.kind === 'tab' && item.tabId) {
      const target = controller.store.item(item.tabId);
      const here = target && (target.spaceId === null || target.spaceId === tabs.space.id);
      if (split && here && tabs.activeItemId && tabs.activeItemId !== item.tabId) {
        tabs.splitWith(item.tabId);
      } else {
        tabs.activate(item.tabId);
      }
      return;
    }
    if (item.kind === 'command' && item.commandId) {
      this.runCommand(controller, item.commandId);
      return;
    }
    // Your work opens in the productivity panel: a project's page (a task's project, or Tasks),
    // or the note.
    if (item.kind === 'project' && item.targetId) {
      controller.notes.openAt(`panel/projects/${item.targetId}`);
      return;
    }
    if (item.kind === 'task' && item.targetId) {
      controller.notes.openAt(item.projectId ? `panel/projects/${item.projectId}` : 'panel/tasks');
      return;
    }
    if (item.kind === 'note' && item.targetId) {
      controller.notes.open(item.targetId);
      return;
    }
    if (item.kind === 'capture' && item.targetId) {
      controller.notes.openAt(`panel/research/${item.projectId ?? 'unsorted'}`);
      return;
    }
    if (item.kind === 'archived' && item.targetId) {
      tabs.restoreFromArchive(item.targetId);
      return;
    }
    if (!item.url) return;
    // Only web addresses may be opened from here (item URLs come from main, but be strict).
    if (
      !/^https?:\/\//i.test(item.url) &&
      !/^orbit:\/\/(newtab|archive|settings)\b/.test(item.url)
    ) {
      return;
    }

    if (split && tabs.activeItemId) {
      tabs.splitWithNew(item.url);
      return;
    }
    if (mode === 'edit' && tabs.active) {
      tabs.active.load(item.url);
      return;
    }
    // Typing an address that's already open switches to it instead of duplicating (Arc).
    const existing = tabs.snapshot().tabs.find((t) => sameUrl(t.url, item.url!));
    if (existing && item.kind === 'navigate') tabs.activate(existing.id);
    else tabs.create(item.url);
  }

  private async suggest(query: string): Promise<string[]> {
    if (!this.suggestionsEnabled || query.length < 2 || classifyInput(query)?.kind === 'url') {
      return [];
    }
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
      const response = await net.fetch(url, { signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS) });
      if (!response.ok) return [];
      return parseSuggestions(await response.json());
    } catch {
      return []; // offline or slow: just no suggestions
    }
  }
}

/** Copies the active tab's URL (⇧⌘C), or as a Markdown link (⇧⌥⌘C). */
export function copyActiveUrl(controller: WindowController, asMarkdown = false): string | null {
  const tab = controller.tabs.active?.state;
  if (!tab || tab.kind !== 'web') return null;
  const text = asMarkdown ? `[${tab.title.replace(/[[\]]/g, '')}](${tab.url})` : tab.url;
  clipboard.writeText(text);
  return text;
}
