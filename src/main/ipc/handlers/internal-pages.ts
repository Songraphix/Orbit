import { dialog } from 'electron';
import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import { SEARCH_ENGINES } from '@shared/settings';
import type { UserSettings } from '@shared/settings';
import type { AiActivity, AiPrefs, AiUsage } from '@shared/ai';
import type { IpcRouter } from '../router';
import { setSearchEngine } from '../../omnibox/classify';
import type { ArchiveRepository } from '../../persistence/repositories/archive';
import type { HistoryRepository } from '../../persistence/repositories/history';
import type { SettingsRepository } from '../../persistence/repositories/settings';
import type { TemplateRepository } from '../../persistence/repositories/templates';
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
    /** Deletes a profile's cookies, storage and cache (when the profile is deleted). */
    clearProfileData: (partition: string) => Promise<void>;
    revealData: () => void;
    /** Tabs on top or in the sidebar, in every window. */
    applyTabLayout: (layout: 'sidebar' | 'top') => void;
    /** Workspace templates (roadmap P2.5). */
    templates: TemplateRepository;
    /** The Anthropic API key (F-29). */
    ai: {
      status: () => {
        hasKey: boolean;
        canStore: boolean;
        model: string;
        prefs: AiPrefs;
        usage: AiUsage;
      };
      setKey: (key: string) => { ok: boolean; error: string | null };
      clearKey: () => void;
      setPrefs: (patch: Partial<AiPrefs>) => void;
      activity: () => { entries: AiActivity[]; usage: AiUsage };
      clearActivity: () => void;
    };
  },
): void {
  /** The page must be a tab currently showing that internal page (or, for Archived Tabs, the
   *  window's Library page, which shows it as a section). */
  const ownerOf = (webContentsId: number, page: 'archive' | 'settings') => {
    if (page === 'archive') {
      const library = windows.libraryFor(webContentsId);
      if (library) return { window: library };
    }
    const owner = windows.tabForContents(webContentsId);
    if (!owner || !owner.tab.state.url.startsWith(`orbit://${page}`)) {
      throw new Error(`Sender ${webContentsId} is not orbit://${page}`);
    }
    return owner;
  };

  router.handle('archive:list', ({ query }, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'archive');
    const entries = deps.archive
      .list(query)
      .map(({ id, title, url, favicon, reason, archivedAt, spaceId }) => ({
        id,
        title,
        url,
        favicon,
        reason,
        archivedAt,
        spaceId,
      }));
    const from = new Set(entries.map((e) => e.spaceId));
    return {
      entries,
      spaces: window.store.spaces
        .filter((s) => from.has(s.id))
        .map(({ id, name, icon }) => ({ id, name, icon })),
    };
  });

  router.handle('archive:delete', ({ id }, { sender }) => {
    ownerOf(sender.webContentsId, 'archive');
    deps.archive.remove(id);
  });

  router.handle('archive:restore', ({ id }, { sender }) => {
    ownerOf(sender.webContentsId, 'archive').window.tabs.restoreFromArchive(id);
  });

  const current = (): UserSettings => ({
    archiveAfter: deps.settings.get('archive.after'),
    maxLive: deps.settings.get('tabs.maxLive'),
    tabLayout: deps.settings.get('tabs.layout'),
    sleepAfterMinutes: deps.settings.get('tabs.sleepAfterMinutes'),
    searchEngine: deps.settings.get('search.engine'),
    peek: deps.settings.get('peek.enabled'),
    peekScope: deps.settings.get('peek.scope'),
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
    if (patch.tabLayout) {
      deps.settings.set('tabs.layout', patch.tabLayout);
      deps.applyTabLayout(patch.tabLayout);
    }
    if (patch.sleepAfterMinutes !== undefined) {
      deps.settings.set('tabs.sleepAfterMinutes', patch.sleepAfterMinutes);
    }
    if (patch.searchEngine) {
      deps.settings.set('search.engine', patch.searchEngine);
      setSearchEngine(SEARCH_ENGINES[patch.searchEngine].url);
    }
    if (patch.peek !== undefined) deps.settings.set('peek.enabled', patch.peek);
    if (patch.peekScope) deps.settings.set('peek.scope', patch.peekScope);
    if (patch.littleShortcut !== undefined) {
      deps.settings.set('little.globalShortcut', patch.littleShortcut);
      deps.applyLittleShortcut(patch.littleShortcut);
    }
    return current();
  });

  router.handle('profiles:list', (_input, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    const { store } = window;
    return {
      profiles: store.profiles.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.id === DEFAULT_PROFILE_ID,
        spaces: store.spaces.filter((s) => s.profileId === p.id).length,
      })),
      spaces: store.spaces.map(({ id, name, icon, profileId }) => ({ id, name, icon, profileId })),
    };
  });

  router.handle('profiles:create', ({ name }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings').window.store.createProfile(name.trim());
  });

  router.handle('profiles:rename', ({ id, name }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings').window.store.renameProfile(id, name);
  });

  router.handle('profiles:delete', async ({ id }, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    const profile = window.store.profiles.find((p) => p.id === id);
    if (!profile) return;
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete the profile “${profile.name}”?`,
      detail: 'Its cookies, logins, history and favorites are deleted from this Mac.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return;
    if (window.store.deleteProfile(id)) await deps.clearProfileData(profile.partition);
  });

  router.handle('profiles:assign', ({ spaceId, profileId }, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    if (!window.store.profiles.some((p) => p.id === profileId)) return;
    window.sidebar.setProfile(spaceId, profileId);
  });

  router.handle('app:revealData', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.revealData();
  });

  router.handle('ai:status', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return deps.ai.status();
  });

  router.handle('ai:setKey', ({ key }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return deps.ai.setKey(key);
  });

  router.handle('ai:clearKey', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.ai.clearKey();
  });

  router.handle('ai:setPrefs', (patch, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.ai.setPrefs(patch);
  });

  router.handle('ai:activity', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return deps.ai.activity();
  });

  /** Asks first: the log is the only record of what was sent. */
  router.handle('ai:clearActivity', async (_input, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: 'Clear the AI activity log?',
      detail: 'This month’s usage starts again from zero, and the monthly limit with it.',
      buttons: ['Clear', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 0) deps.ai.clearActivity();
  });

  router.handle('templates:list', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return {
      templates: deps.templates
        .list()
        .map(({ id, name, icon, tabs }) => ({ id, name, icon, tabs: tabs.length })),
    };
  });

  router.handle('templates:rename', ({ id, name }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.templates.rename(id, name);
  });

  router.handle('templates:delete', async ({ id }, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    const template = deps.templates.get(id);
    if (!template) return { deleted: false };
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete the template “${template.name}”?`,
      detail: 'Spaces already made from it stay as they are.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { deleted: false };
    deps.templates.delete(id);
    return { deleted: true };
  });

  router.handle('history:clear', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.history.clear();
  });
}
