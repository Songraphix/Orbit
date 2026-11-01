import type { IpcRouter } from '../router';
import { classifyInput } from '../../omnibox/classify';
import type { WindowManager } from '../../windows/window-manager';

export function registerTabHandlers(router: IpcRouter, windows: WindowManager): void {
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
    tabsFor(sender.webContentsId).activate(tabId);
  });

  router.handle('tabs:close', ({ tabId }, { sender }) => {
    tabsFor(sender.webContentsId).close(tabId);
  });
}
