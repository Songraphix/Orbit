import { DEFAULT_APP_OPTIONS } from '@shared/apps';
import { addApp, appLibraryView } from '../../apps/library';
import { openFavorite } from '../../apps/open';
import type { AppList, AppOptions, OpenIn } from '@shared/apps';
import type { IpcRouter } from '../router';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * App Hub (brief M5): the docked app panel's header (from the shell), and Settings → Apps —
 * your favourites as apps: add by address, rename, where each opens, which Spaces show it.
 */
export function registerAppHubHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    /** Little Orbit: the panel's app in its own small window. */
    openWindow?: (url: string) => void;
    /** Where newly added apps open (Settings → Appearance). */
    defaultOpenIn?: () => OpenIn;
  } = {},
): void {
  const shellOf = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller || controller.win.webContents.id !== webContentsId) {
      throw new Error(`Sender ${webContentsId} is not a shell`);
    }
    return controller;
  };
  const settingsOf = (webContentsId: number) => {
    const window = windows.settingsFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} is not Settings`);
    return window;
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

  /** The shell's header, or the overlay's when the app floats. */
  const chromeOf = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`Sender ${webContentsId} has no window`);
    return controller;
  };

  router.handle('apps:panelState', (_input, { sender }) =>
    chromeOf(sender.webContentsId).appPanel.state(),
  );
  router.handle('apps:alive', (_input, { sender }) =>
    shellOf(sender.webContentsId).appPanel.alive(),
  );

  router.handle('apps:panel', ({ action }, { sender }) => {
    const controller = chromeOf(sender.webContentsId);
    const { appPanel } = controller;
    if (action === 'pin' || action === 'unpin') appPanel.setPinned(action === 'pin');
    else if (action === 'quit') {
      const id = appPanel.openItemId;
      if (id) appPanel.quit(id);
    } else if (action === 'manage') controller.overlay.showAppLibrary(appLibraryView(controller));
    else if (action === 'openInWindow') {
      const url = appPanel.state()?.url;
      const id = appPanel.openItemId;
      // It moves to its own window: the panel's copy stops (no music playing twice).
      if (id) appPanel.quit(id);
      else appPanel.close();
      if (url) deps.openWindow?.(url);
    } else if (action === 'close') appPanel.close();
    else if (action === 'openAsTab') appPanel.openAsTab();
    else appPanel.navigate(action);
  });

  // The App Library (overlay): search, open, add — Settings → Apps keeps the details.
  const windowOf = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller;
  };
  router.handle('applib:open', (_input, { sender }) => {
    // From the shell or overlay, or from the Homepage (an Orbit page in a tab).
    const controller =
      windows.forSender(sender.webContentsId) ??
      windows.tabForContents(sender.webContentsId)?.window;
    if (!controller) throw new Error(`No window for sender ${sender.webContentsId}`);
    controller.overlay.showAppLibrary(appLibraryView(controller));
  });
  router.handle('applib:launch', ({ itemId }, { sender }) => {
    const controller = windowOf(sender.webContentsId);
    controller.overlay.closeAppLibrary();
    openFavorite(controller, itemId, deps.openWindow);
  });
  router.handle('applib:add', ({ url, title }, { sender }) => {
    const controller = windowOf(sender.webContentsId);
    addApp(controller, url, title, deps.defaultOpenIn?.());
    controller.overlay.showAppLibrary(appLibraryView(controller), true);
  });
  router.handle('applib:close', ({ settings }, { sender }) => {
    const controller = windowOf(sender.webContentsId);
    controller.overlay.closeAppLibrary();
    if (settings) windows.openSettings('apps');
  });

  router.handle('apps:list', (_input, { sender }) => list(settingsOf(sender.webContentsId)));

  router.handle('apps:add', ({ url, title }, { sender }) => {
    const window = settingsOf(sender.webContentsId);
    addApp(window, url, title, deps.defaultOpenIn?.());
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
