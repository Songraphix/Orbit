import { appUrl, DEFAULT_APP_OPTIONS } from '@shared/apps';
import type { AppList, AppOptions } from '@shared/apps';
import type { IpcRouter } from '../router';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * App Hub (brief M5): the docked app panel's header (from the shell), and Settings → Apps —
 * your favourites as apps: add by address, rename, where each opens, which Spaces show it.
 */
export function registerAppHubHandlers(router: IpcRouter, windows: WindowManager): void {
  const shellOf = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller || controller.win.webContents.id !== webContentsId) {
      throw new Error(`Sender ${webContentsId} is not a shell`);
    }
    return controller;
  };
  const settingsOf = (webContentsId: number) => {
    const found = windows.tabForContents(webContentsId);
    if (!found?.tab.state.url.startsWith('orbit://settings')) {
      throw new Error(`Sender ${webContentsId} is not Settings`);
    }
    return found.window;
  };

  /** The favourites of the profile this window's Space uses. */
  const list = (window: WindowController): AppList => {
    const { store } = window;
    const space = window.tabs.space;
    return {
      apps: store
        .rows('favorite', space)
        .filter(({ item }) => item.kind === 'tab')
        .map(({ item }) => ({
          id: item.id,
          title: item.titleOverride || item.title || item.url || 'App',
          url: item.homeUrl ?? item.url ?? '',
          favicon: item.favicon,
          openIn: item.data?.app?.openIn ?? 'tab',
          spaces: item.data?.app?.spaces ?? null,
        })),
      spaces: store.spaces
        .filter((s) => s.profileId === space.profileId)
        .map((s) => ({ id: s.id, name: s.name })),
    };
  };

  router.handle('apps:panelState', (_input, { sender }) =>
    shellOf(sender.webContentsId).appPanel.state(),
  );

  router.handle('apps:panel', ({ action }, { sender }) => {
    const { appPanel } = shellOf(sender.webContentsId);
    if (action === 'close') appPanel.close();
    else if (action === 'openAsTab') appPanel.openAsTab();
    else appPanel.navigate(action);
  });

  router.handle('apps:list', (_input, { sender }) => list(settingsOf(sender.webContentsId)));

  router.handle('apps:add', ({ url, title }, { sender }) => {
    const window = settingsOf(sender.webContentsId);
    const address = appUrl(url);
    if (!address) throw new Error('That isn’t a web address');
    const space = window.tabs.space;
    const item = window.store.insert(
      {
        kind: 'tab',
        title: title?.trim() || new URL(address).hostname.replace(/^www\./, ''),
        url: address,
      },
      {
        section: 'favorite',
        profileId: space.profileId,
        spaceId: null,
        parentId: null,
        beforeId: null,
      },
    );
    window.store.setHome(item.id, address);
    if (title?.trim()) window.store.rename(item.id, title.trim());
    return list(window);
  });

  router.handle('apps:update', ({ itemId, title, openIn, spaces }, { sender }) => {
    const window = settingsOf(sender.webContentsId);
    const item = window.store.item(itemId);
    if (!item || item.section !== 'favorite') throw new Error('That app is no longer there');
    if (title !== undefined) window.store.rename(itemId, title.trim() || null);
    if (openIn !== undefined || spaces !== undefined) {
      const current: AppOptions = item.data?.app ?? DEFAULT_APP_OPTIONS;
      const app: AppOptions = {
        openIn: openIn ?? current.openIn,
        spaces: spaces === undefined ? current.spaces : spaces,
      };
      window.store.setData(itemId, { ...item.data, app });
      // An app no longer opening in the panel leaves it.
      if (app.openIn !== 'panel' && window.appPanel.openItemId === itemId) window.appPanel.close();
    }
    return list(window);
  });

  router.handle('apps:remove', ({ itemId }, { sender }) => {
    const window = settingsOf(sender.webContentsId);
    const item = window.store.item(itemId);
    if (!item || item.section !== 'favorite') return list(window);
    if (window.appPanel.openItemId === itemId) {
      window.appPanel.close();
      window.appPanel.destroy();
    }
    for (const controller of windows.all()) controller.tabs.unload(itemId);
    window.store.remove(itemId);
    return list(window);
  });
}
