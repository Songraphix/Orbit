import { NEW_TAB_URL } from '@shared/types/tabs';
import type { NewTabState } from '@shared/types/newtab';
import type { IpcRouter } from '../router';
import { classifyInput } from '../../omnibox/classify';
import type { WallpaperService } from '../../newtab/wallpaper-service';
import { seedShortcuts, shortcutTitle } from '../../newtab/home-model';
import { fetchSiteIcon } from '../../newtab/site-icon';
import type { HistoryRepository } from '../../persistence/repositories/history';
import type { HomeRepository } from '../../persistence/repositories/home';
import type { SettingsRepository } from '../../persistence/repositories/settings';
import type { WindowController, WindowManager } from '../../windows/window-manager';
import type { TabController } from '../../tabs/tab-controller';

/** Handlers for orbit://newtab. The router only lets internal pages call these. */
export function registerNewTabHandlers(
  router: IpcRouter,
  windows: WindowManager,
  wallpapers: WallpaperService,
  deps: { home: HomeRepository; settings: SettingsRepository; history: HistoryRepository },
): void {
  const { home, settings, history } = deps;

  const ownerOf = (webContentsId: number) => {
    const owner = windows.tabForContents(webContentsId);
    // Belt and braces: the page must be a tab currently showing the new tab page.
    if (!owner || owner.tab.state.url !== NEW_TAB_URL) {
      throw new Error(`Sender ${webContentsId} is not a new tab page`);
    }
    return owner;
  };

  /** The profile of the space this new tab page is in. */
  const profileOf = ({ window, tab }: { window: WindowController; tab: TabController }) =>
    window.store.item(tab.id)?.profileId ?? window.tabs.space.profileId;

  const state = (owner: { window: WindowController; tab: TabController }): NewTabState => {
    const profileId = profileOf(owner);
    // A profile's first visit fills its shortcuts with its most-visited sites.
    if (home.shortcuts(profileId).length === 0 && home.claimSeed(profileId)) {
      for (const s of seedShortcuts(history.topSites(30))) home.addShortcut(profileId, s);
    }
    return {
      ...wallpapers.state(),
      home: settings.get('newtab.home'),
      name: owner.window.store.profiles.find((p) => p.id === profileId)?.displayName ?? '',
      shortcuts: home.shortcuts(profileId),
      todos: home.todos(profileId),
    };
  };

  router.handle('newtab:get', (_input, { sender }) => state(ownerOf(sender.webContentsId)));

  router.handle('newtab:setWallpaper', ({ wallpaper }, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    wallpapers.set(wallpaper);
    return state(owner);
  });

  router.handle('newtab:chooseImage', async (_input, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const chosen = await wallpapers.choose(owner.window.win);
    return chosen ? state(owner) : null;
  });

  router.handle('newtab:setHome', (patch, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const current = settings.get('newtab.home');
    settings.set('newtab.home', {
      theme: patch.theme ?? current.theme,
      tagline: patch.tagline !== undefined ? patch.tagline.trim() : current.tagline,
      show: { ...current.show, ...patch.show },
    });
    return state(owner);
  });

  router.handle('newtab:setName', ({ name }, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    owner.window.store.updateProfile(profileOf(owner), { displayName: name });
    return state(owner);
  });

  router.handle('newtab:shortcut', async (input, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const profileId = profileOf(owner);
    if (input.action === 'remove') {
      home.removeShortcut(profileId, input.id);
      return state(owner);
    }
    const target = classifyInput(input.url.trim());
    if (!target || target.kind !== 'url' || !/^https?:/.test(target.url)) {
      throw new Error('Enter a web address, like figma.com');
    }
    const icon = history.faviconFor(target.url) ?? (await fetchSiteIcon(target.url));
    const title = input.title.trim() || shortcutTitle('', target.url);
    if (!home.addShortcut(profileId, { title, url: target.url, icon })) {
      throw new Error('The shortcuts row is full — remove one first');
    }
    return state(owner);
  });

  router.handle('newtab:todo', (input, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    const profileId = profileOf(owner);
    if (input.action === 'add') home.addTodo(profileId, input.text.trim());
    else if (input.action === 'toggle') home.toggleTodo(profileId, input.id);
    else home.removeTodo(profileId, input.id);
    return state(owner);
  });

  router.handle('newtab:navigate', ({ input }, { sender }) => {
    const { tab } = ownerOf(sender.webContentsId);
    const target = classifyInput(input);
    // Load in this same tab; TabController swaps in a fresh, unprivileged web view.
    if (target) tab.load(target.url);
  });
}
