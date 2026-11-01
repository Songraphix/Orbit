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

  router.handle('sidebar:prepareResize', async (_input, { sender }) => {
    await windowFor(sender.webContentsId).tabs.prepareFreeze();
  });

  // Synchronous on purpose: the view must be hidden before the next pointer move arrives.
  router.handle('sidebar:beginResize', (_input, { sender }) => ({
    snapshot: windowFor(sender.webContentsId).tabs.freeze(),
  }));

  router.handle('split:create', ({ tabId }, { sender }) => {
    const { tabs } = windowFor(sender.webContentsId);
    if (tabId) tabs.splitWith(tabId);
    else tabs.splitWithNew();
  });
  router.handle('split:exit', (_input, { sender }) =>
    windowFor(sender.webContentsId).tabs.exitSplit(),
  );
  router.handle('split:swap', (_input, { sender }) =>
    windowFor(sender.webContentsId).tabs.swapSplit(),
  );
  router.handle('split:setRatio', ({ ratio }, { sender }) =>
    windowFor(sender.webContentsId).tabs.setSplitRatio(ratio),
  );
  router.handle('split:beginResize', (_input, { sender }) => {
    windowFor(sender.webContentsId).tabs.freeze();
  });
  router.handle('split:endResize', (_input, { sender }) => {
    windowFor(sender.webContentsId).tabs.unfreeze();
  });

  router.handle('peek:close', (_input, { sender }) => windowFor(sender.webContentsId).peek.close());
  router.handle('peek:promote', (_input, { sender }) =>
    windowFor(sender.webContentsId).peek.promote(),
  );

  router.handle('sidebar:endResize', (_input, { sender }) => {
    const { tabs, layout } = windowFor(sender.webContentsId);
    layout.flush(); // save the final width now rather than after the debounce
    tabs.unfreeze();
  });
}
