import { clipboard, net } from 'electron';
import type { CommandBarMode, CommandItem } from '@shared/types/command-bar';
import { classifyInput, searchUrl } from '../omnibox/classify';
import type { HistoryRepository } from '../persistence/repositories/history';
import type { WindowController } from '../windows/window-manager';
import { buildResults, parseSuggestions, sameUrl } from './model';
import type { CommandDef } from './model';

/** Commands the bar can run (F-21). Each also has a menu shortcut, shown as the subtitle. */
export const COMMANDS: readonly CommandDef[] = [
  { id: 'new-tab-page', title: 'New Tab Page', keywords: ['wallpaper', 'home'] },
  { id: 'toggle-sidebar', title: 'Toggle Sidebar', keywords: ['hide', 'show'], shortcut: '⌘S' },
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
  },
  {
    id: 'new-easel',
    title: 'New Easel',
    keywords: ['canvas', 'draw', 'notes', 'whiteboard'],
    shortcut: '⌃⇧E',
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
  ) {}

  async query(controller: WindowController, query: string): Promise<CommandItem[]> {
    const mode: CommandBarMode = controller.overlay.mode ?? 'new';
    const trimmed = query.trim();
    const snapshot = controller.tabs.snapshot();
    const [history, suggestions] = await Promise.all([
      Promise.resolve(trimmed ? this.history.search(trimmed, 10) : []),
      this.suggest(trimmed),
    ]);
    return buildResults({
      query: trimmed,
      mode,
      classified: classifyInput(trimmed),
      tabs: snapshot.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favicon: t.favicon,
        active: t.id === snapshot.activeTabId,
      })),
      history,
      suggestions,
      commands: COMMANDS,
      searchUrl,
    });
  }

  execute(controller: WindowController, item: CommandItem): void {
    const mode = controller.overlay.mode ?? 'new';
    controller.overlay.close();
    const { tabs } = controller;

    if (item.kind === 'tab' && item.tabId) {
      tabs.activate(item.tabId);
      return;
    }
    if (item.kind === 'command' && item.commandId) {
      this.runCommand(controller, item.commandId);
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
