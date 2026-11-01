import { SEARCH_ENGINES } from '@shared/settings';
import type { UserSettings } from '@shared/settings';
import type { IpcRouter } from '../router';
import { setSearchEngine } from '../../omnibox/classify';
import type { ArchiveRepository } from '../../persistence/repositories/archive';
import type { HistoryRepository } from '../../persistence/repositories/history';
import type { SettingsRepository } from '../../persistence/repositories/settings';
import type { WindowManager } from '../../windows/window-manager';

/** Handlers for orbit://archive and orbit://settings (internal surface only). */
export function registerInternalPageHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    archive: ArchiveRepository;
    settings: SettingsRepository;
    history: HistoryRepository;
    /** Turns the ⌥⌘N global shortcut on or off. */
    applyLittleShortcut: (enabled: boolean) => void;
  },
): void {
  /** The page must be a tab currently showing that internal page. */
  const ownerOf = (webContentsId: number, page: 'archive' | 'settings') => {
    const owner = windows.tabForContents(webContentsId);
    if (!owner || !owner.tab.state.url.startsWith(`orbit://${page}`)) {
      throw new Error(`Sender ${webContentsId} is not orbit://${page}`);
    }
    return owner;
  };

  router.handle('archive:list', ({ query }, { sender }) => {
    ownerOf(sender.webContentsId, 'archive');
    return {
      entries: deps.archive.list(query).map(({ id, title, url, favicon, reason, archivedAt }) => ({
        id,
        title,
        url,
        favicon,
        reason,
        archivedAt,
      })),
    };
  });

  router.handle('archive:restore', ({ id }, { sender }) => {
    ownerOf(sender.webContentsId, 'archive').window.tabs.restoreFromArchive(id);
  });

  const current = (): UserSettings => ({
    archiveAfter: deps.settings.get('archive.after'),
    maxLive: deps.settings.get('tabs.maxLive'),
    sleepAfterMinutes: deps.settings.get('tabs.sleepAfterMinutes'),
    searchEngine: deps.settings.get('search.engine'),
    peek: deps.settings.get('peek.enabled'),
    littleShortcut: deps.settings.get('little.globalShortcut'),
  });

  router.handle('settings:get', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return current();
  });

  router.handle('settings:set', (patch, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    if (patch.archiveAfter) deps.settings.set('archive.after', patch.archiveAfter);
    if (patch.maxLive !== undefined) deps.settings.set('tabs.maxLive', patch.maxLive);
    if (patch.sleepAfterMinutes !== undefined) {
      deps.settings.set('tabs.sleepAfterMinutes', patch.sleepAfterMinutes);
    }
    if (patch.searchEngine) {
      deps.settings.set('search.engine', patch.searchEngine);
      setSearchEngine(SEARCH_ENGINES[patch.searchEngine].url);
    }
    if (patch.peek !== undefined) deps.settings.set('peek.enabled', patch.peek);
    if (patch.littleShortcut !== undefined) {
      deps.settings.set('little.globalShortcut', patch.littleShortcut);
      deps.applyLittleShortcut(patch.littleShortcut);
    }
    return current();
  });

  router.handle('history:clear', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.history.clear();
  });
}
