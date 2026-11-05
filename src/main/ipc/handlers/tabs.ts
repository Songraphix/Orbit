import type { IpcRouter } from '../router';
import type { TabController } from '../../tabs/tab-controller';
import { classifyInput } from '../../omnibox/classify';
import type { WindowManager } from '../../windows/window-manager';
import { openFavorite } from '../../apps/open';

export function registerTabHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    /** App Hub: a favourite that opens in its own small window (Little Orbit). */
    openWindow?: (url: string) => void;
  } = {},
): void {
  const tabsFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller.tabs;
  };

  router.handle('tabs:get', (_input, { sender }) => tabsFor(sender.webContentsId).snapshot());

  router.handle('tabs:create', ({ url }, { sender }) => {
    // Anything typed is classified first: "github.com" → https://github.com/, "cats" → search.
    const target = url === undefined ? undefined : classifyInput(url)?.url;
    const tab = tabsFor(sender.webContentsId).create(target);
    return { tabId: tab.id };
  });

  router.handle('tabs:activate', ({ tabId, from }, { sender }) => {
    // App Hub (brief M5): a favourite may open in the docked panel (a click again closes it)
    // or its own window. From the rail, apps always open beside the page (owner request).
    const controller = windows.forSender(sender.webContentsId);
    const options = { toggle: true, panel: from === 'rail' };
    if (controller && openFavorite(controller, tabId, deps.openWindow, options)) return;
    tabsFor(sender.webContentsId).activate(tabId);
  });

  router.handle('tabs:close', ({ tabId }, { sender }) => {
    tabsFor(sender.webContentsId).close(tabId);
  });

  router.handle('tabs:navigate', ({ tabId, action }, { sender }) => {
    const tab = tabsFor(sender.webContentsId).get(tabId);
    if (tab) navigateTab(tab, action);
  });
}

/** Shared by the toolbar (IPC) and the menu bar (⌘[, ⌘], ⌘R, ⇧⌘R). */
export function navigateTab(
  tab: TabController,
  action: 'back' | 'forward' | 'reload' | 'hardReload' | 'stop',
): void {
  switch (action) {
    case 'back':
      return tab.goBack();
    case 'forward':
      return tab.goForward();
    case 'reload':
      return tab.reload();
    case 'hardReload':
      return tab.reload(true);
    case 'stop':
      return tab.stop();
  }
}
