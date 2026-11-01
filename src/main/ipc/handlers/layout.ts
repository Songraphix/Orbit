import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';

export function registerLayoutHandlers(router: IpcRouter, windows: WindowManager): void {
  const layoutFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller.layout;
  };

  router.handle('layout:get', (_input, { sender }) => layoutFor(sender.webContentsId).current());

  router.handle('sidebar:toggle', (_input, { sender }) => {
    layoutFor(sender.webContentsId).toggleSidebar();
  });

  router.handle('sidebar:setWidth', ({ width }, { sender }) => {
    layoutFor(sender.webContentsId).setSidebarWidth(width);
  });
}
