import type { IpcRouter } from '../router';
import type { CommandBarService } from '../../commandbar/service';
import type { WindowManager } from '../../windows/window-manager';

export function registerCommandBarHandlers(
  router: IpcRouter,
  windows: WindowManager,
  commandBar: CommandBarService,
): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller;
  };

  router.handle('commandbar:open', ({ mode }, { sender }) => {
    windows.openCommandBar(windowFor(sender.webContentsId), mode);
  });

  router.handle('commandbar:query', async ({ query }, { sender }) => ({
    items: await commandBar.query(windowFor(sender.webContentsId), query),
  }));

  router.handle('commandbar:execute', ({ item, split, voice }, { sender }) => {
    commandBar.execute(windowFor(sender.webContentsId), item, split ?? false, voice ?? false);
  });

  router.handle(
    'overlay:get',
    (_input, { sender }) => windowFor(sender.webContentsId).overlay.current,
  );

  router.handle('overlay:answer', (answer, { sender }) => {
    windowFor(sender.webContentsId).overlay.answer(answer);
  });

  router.handle('overlay:close', (_input, { sender }) => {
    windowFor(sender.webContentsId).overlay.close();
  });
}
