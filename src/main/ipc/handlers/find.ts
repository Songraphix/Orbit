import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';

export function registerFindHandlers(router: IpcRouter, windows: WindowManager): void {
  const findFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller.find;
  };

  router.handle('find:get', (_input, { sender }) => findFor(sender.webContentsId).current);

  router.handle('find:search', ({ query, direction }, { sender }) => {
    findFor(sender.webContentsId).search(query, direction);
  });

  router.handle('find:close', (_input, { sender }) => {
    const controller = windows.forSender(sender.webContentsId);
    controller?.find.close();
    controller?.tabs.active?.view.webContents.focus(); // back to the page, like Esc in Chrome
  });
}
