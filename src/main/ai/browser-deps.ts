import { showsIn } from '@shared/apps';
import type { WindowController } from '../windows/window-manager';
import type { HistoryRepository } from '../persistence/repositories/history';
import type { NotesRepository } from '../persistence/repositories/notes';
import { noteFromMarkdown } from '../notes/from-markdown';
import { searchUrl } from '../omnibox/classify';
import type { BrowserToolDeps, TabInfo } from './browser-tools';
import type { DriveService } from '../drive/service';
import { driveKind } from '@shared/drive';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * What Orbit AI's browser tools act on, for one window: its tabs and Spaces, the profile's apps
 * (favourites), history and notes. Built per question (the user's words decide which links open
 * without asking).
 */
export function browserToolDeps(
  controller: WindowController,
  services: {
    history: HistoryRepository;
    notes: NotesRepository;
    /** Opens an app the way it's set to open (tab, panel, window), as clicking it does. */
    openApp: (controller: WindowController, itemId: string) => boolean;
    notesChanged: () => void;
    /** Google Drive, when it's connected. */
    drive?: DriveService | null;
  },
  userWords: string,
): BrowserToolDeps {
  const { store, tabs } = controller;
  const tabRows = (scope: 'this_space' | 'all_spaces'): TabInfo[] => {
    const here = tabs.space;
    const spaces =
      scope === 'this_space' ? [here] : store.spaces.filter((s) => s.profileId === here.profileId);
    const out: TabInfo[] = [];
    const seen = new Set<string>();
    for (const space of spaces) {
      for (const section of ['favorite', 'pinned', 'today'] as const) {
        for (const { item } of store.rows(section, space)) {
          if (item.kind !== 'tab' || seen.has(item.id)) continue;
          if (section === 'favorite' && !showsIn(item.data?.app, space.id)) continue;
          seen.add(item.id);
          out.push({
            id: item.id,
            title: item.titleOverride || item.title || item.url || 'Tab',
            url: item.url ?? item.homeUrl ?? '',
            showing: item.id === tabs.activeItemId,
            section,
            space: space.name,
          });
        }
      }
    }
    return out;
  };
  const apps = () =>
    store
      .rows('favorite', tabs.space)
      .filter(({ item }) => item.kind === 'tab' && showsIn(item.data?.app, tabs.space.id))
      .map(({ item }) => ({
        id: item.id,
        name: item.titleOverride || item.title || hostOf(item.homeUrl ?? item.url ?? ''),
        url: item.homeUrl ?? item.url ?? '',
        opens_in: item.data?.app?.openIn ?? 'tab',
      }));
  const visits = (rows: { url: string; title: string; lastVisitAt: number }[]) =>
    rows.map(({ url, title, lastVisitAt }) => ({ url, title, lastVisitAt }));
  const drive = services.drive?.connected ? services.drive : null;
  return {
    userWords,
    ...(drive
      ? {
          drive: {
            search: async (words: string) =>
              (await drive.search(words, { limit: 15 })).map((f) => ({
                id: f.id,
                name: f.name,
                kind: driveKind(f.mimeType),
                modified: f.modifiedTime,
                url: f.webViewLink,
              })),
            read: async (fileId: string) => {
              const { file, text, truncated } = await drive.read(fileId);
              return {
                name: file.name,
                kind: driveKind(file.mimeType),
                url: file.webViewLink,
                text,
                truncated,
              };
            },
          },
        }
      : {}),
    tabs: tabRows,
    switchTo: (tabId) => {
      if (!store.item(tabId)) return false;
      tabs.activate(tabId);
      return true;
    },
    openUrl: (url, beside) => {
      if (beside && tabs.activeItemId) tabs.splitWithNew(url);
      else tabs.create(url, { activate: true });
    },
    search: (query) => {
      const url = searchUrl(query);
      tabs.create(url, { activate: true });
      return url;
    },
    apps,
    openApp: (appId) => services.openApp(controller, appId),
    history: {
      search: (query, limit) => visits(services.history.search(query, limit)),
      between: (from, to, limit) => visits(services.history.visitedBetween(from, to, limit)),
      knows: (host) => services.history.knowsHost(host),
    },
    notes: {
      list: (query) => services.notes.list(query),
      read: (id) => {
        const note = services.notes.get(id);
        if (!note) return null;
        return { title: services.notes.title(id) ?? 'Note', text: note.text };
      },
      open: (id) => {
        if (!services.notes.get(id)) return false;
        // Beside the page, in split view (the panel may be showing this conversation).
        if (tabs.activeItemId) tabs.splitWithNew(`orbit://note/${id}`);
        else tabs.create(`orbit://note/${id}`, { activate: true });
        return true;
      },
      create: (title, markdown) => {
        const note = noteFromMarkdown(title, markdown);
        const id = services.notes.create(Date.now());
        services.notes.save(id, note.doc, note.text);
        services.notesChanged();
        return id;
      },
    },
  };
}
