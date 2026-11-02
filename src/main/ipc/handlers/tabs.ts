import type { IpcRouter } from '../router';
import type { TabController } from '../../tabs/tab-controller';
import { classifyInput } from '../../omnibox/classify';
import type { WindowManager } from '../../windows/window-manager';

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

  router.handle('tabs:activate', ({ tabId }, { sender }) => {
    // App Hub (brief M5): a favourite may open in the docked panel or its own window.
    const controller = windows.forSender(sender.webContentsId);
    const item = controller?.store.item(tabId);
    const openIn = item?.section === 'favorite' ? item.data?.app?.openIn : undefined;
    const url = item ? (item.homeUrl ?? item.url) : null;
    if (controller && item && url && openIn === 'panel') {
      controller.appPanel.toggle(item.id, url);
      return;
    }
    if (url && openIn === 'window' && deps.openWindow) {
      deps.openWindow(url);
      return;
    }
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
