import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';

export function registerLayoutHandlers(router: IpcRouter, windows: WindowManager): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller;
  };

  router.handle('layout:get', (_input, { sender }) =>
    windowFor(sender.webContentsId).layout.current(),
  );

  router.handle('sidebar:toggle', (_input, { sender }) => {
    windowFor(sender.webContentsId).layout.toggleSidebar();
  });

  router.handle('sidebar:setWidth', ({ width }, { sender }) => {
    windowFor(sender.webContentsId).layout.setSidebarWidth(width);
  });

  router.handle('sidebar:beginResize', async (_input, { sender }) => ({
    snapshot: await windowFor(sender.webContentsId).tabs.freeze(),
  }));

  router.handle('sidebar:endResize', (_input, { sender }) => {
    const { tabs, layout } = windowFor(sender.webContentsId);
    layout.flush(); // save the final width now rather than after the debounce
    tabs.unfreeze();
  });
}
