import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';

export function registerSidebarHandlers(router: IpcRouter, windows: WindowManager): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller;
  };

  router.handle('sidebar:get', (_i, { sender }) =>
    windowFor(sender.webContentsId).tabs.sidebarSnapshot(),
  );

  router.handle('sidebar:toggleFolder', ({ itemId }, { sender }) => {
    const { store } = windowFor(sender.webContentsId);
    const item = store.item(itemId);
    if (item?.kind === 'folder') store.setCollapsed(itemId, !item.collapsed);
  });

  router.handle('sidebar:goHome', ({ itemId }, { sender }) => {
    windowFor(sender.webContentsId).tabs.goHome(itemId);
  });

  router.handle('sidebar:clearToday', (_i, { sender }) => {
    windowFor(sender.webContentsId).sidebar.clearToday();
  });

  router.handle('sidebar:rename', ({ itemId, title }, { sender }) => {
    windowFor(sender.webContentsId).store.rename(itemId, title.trim() || null);
  });

  router.handle('sidebar:move', ({ itemId, section, parentId, beforeId }, { sender }) => {
    windowFor(sender.webContentsId).sidebar.move(itemId, section, parentId, beforeId);
  });

  router.handle('sidebar:itemMenu', ({ itemId }, { sender }) => {
    windowFor(sender.webContentsId).sidebar.itemMenu(itemId);
  });

  router.handle('sidebar:spaceMenu', ({ spaceId }, { sender }) => {
    windowFor(sender.webContentsId).sidebar.spaceMenu(spaceId);
  });

  router.handle('sidebar:createMenu', (_i, { sender }) => {
    windowFor(sender.webContentsId).sidebar.createMenu();
  });

  router.handle('spaces:activate', ({ spaceId }, { sender }) => {
    windowFor(sender.webContentsId).tabs.switchSpace(spaceId);
  });

  router.handle('spaces:cycle', ({ direction }, { sender }) => {
    windowFor(sender.webContentsId).tabs.cycleSpace(direction);
  });

  router.handle('spaces:update', ({ spaceId, ...patch }, { sender }) => {
    windowFor(sender.webContentsId).store.updateSpace(spaceId, patch);
  });
}
