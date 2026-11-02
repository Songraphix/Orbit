import { randomUUID } from 'node:crypto';
import { dialog } from 'electron';
import { cleanPattern, patternProblem } from '@shared/rules';
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
import type { ProjectTemplateRepository } from '../../persistence/repositories/project-templates';
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
    /** Settings → Appearance: light, dark or the Mac's (nativeTheme.themeSource). */
    applyAppearance: (appearance: 'system' | 'light' | 'dark') => void;
    /** Workspace templates (roadmap P2.5). */
    templates: TemplateRepository;
    /** The Anthropic API key (F-29). */
    projectTemplates: ProjectTemplateRepository;
    github: {
      status: () => { hasToken: boolean; canStore: boolean };
      setToken: (token: string) => { ok: boolean; error: string | null };
      clearToken: () => void;
    };
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
    appearance: deps.settings.get('appearance'),
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
    if (patch.appearance) {
      deps.settings.set('appearance', patch.appearance);
      deps.applyAppearance(patch.appearance);
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

  router.handle('templates:projects', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return {
      templates: deps.projectTemplates
        .list()
        .map(({ id, name, tasks, builtIn }) => ({ id, name, tasks: tasks.length, builtIn })),
    };
  });

  router.handle('templates:renameProject', ({ id, name }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.projectTemplates.rename(id, name);
  });

  router.handle('templates:deleteProject', async ({ id }, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    const template = deps.projectTemplates.get(id);
    if (!template || template.builtIn) return;
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete the project template “${template.name}”?`,
      detail: 'Projects started from it keep their tasks.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 0) deps.projectTemplates.delete(id);
  });

  router.handle('rules:list', (_input, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    return {
      rules: deps.settings.get('rules'),
      spaces: window.store.spaces.map(({ id, name }) => ({ id, name })),
    };
  });

  router.handle('rules:add', (input, { sender }) => {
    const { window } = ownerOf(sender.webContentsId, 'settings');
    const rules = deps.settings.get('rules');
    if (rules.length >= 100)
      return { ok: false, error: 'That’s a lot of rules — remove one first' };
    if (input.kind === 'link') {
      const problem = patternProblem(input.pattern);
      if (problem) return { ok: false, error: problem };
      if (input.target === 'space' && !(input.spaceId && window.store.space(input.spaceId))) {
        return { ok: false, error: 'Choose a Space' };
      }
      deps.settings.set('rules', [
        ...rules,
        {
          ...input,
          id: randomUUID(),
          pattern: cleanPattern(input.pattern),
          spaceId: input.target === 'space' ? input.spaceId : null,
        },
      ]);
    } else {
      if (!window.store.space(input.spaceId)) return { ok: false, error: 'Choose a Space' };
      // One archive rule per Space: a new one replaces the old.
      deps.settings.set('rules', [
        ...rules.filter((r) => !(r.kind === 'archive' && r.spaceId === input.spaceId)),
        { ...input, id: randomUUID() },
      ]);
    }
    return { ok: true, error: null };
  });

  router.handle('rules:toggle', ({ id, enabled }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.settings.set(
      'rules',
      deps.settings.get('rules').map((r) => (r.id === id ? { ...r, enabled } : r)),
    );
  });

  router.handle('rules:delete', ({ id }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.settings.set(
      'rules',
      deps.settings.get('rules').filter((r) => r.id !== id),
    );
  });

  router.handle('github:status', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return deps.github.status();
  });

  router.handle('github:setToken', ({ token }, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    return deps.github.setToken(token);
  });

  router.handle('github:clearToken', (_input, { sender }) => {
    ownerOf(sender.webContentsId, 'settings');
    deps.github.clearToken();
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
