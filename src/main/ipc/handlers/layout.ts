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

  router.handle('sidebar:peek', ({ open }, { sender }) => {
    windowFor(sender.webContentsId).setSidebarPeek(open);
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

  router.handle('dock:setWidth', ({ width }, { sender }) => {
    windowFor(sender.webContentsId).layout.setDockWidth(width);
  });
  // Synchronous like the sidebar's: the views hide before the next pointer move arrives.
  router.handle('dock:beginResize', (_input, { sender }) => {
    const { tabs, notes, appPanel } = windowFor(sender.webContentsId);
    notes.suspend(true);
    appPanel.suspend(true);
    return { snapshot: tabs.freeze() };
  });
  router.handle('dock:endResize', (_input, { sender }) => {
    const { tabs, notes, appPanel, layout } = windowFor(sender.webContentsId);
    layout.flushDock();
    tabs.unfreeze();
    notes.suspend(false);
    appPanel.suspend(false);
  });

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
  router.handle('peek:split', (_input, { sender }) => windowFor(sender.webContentsId).peek.split());
  router.handle('peek:navigate', ({ action }, { sender }) =>
    windowFor(sender.webContentsId).peek.navigate(action),
  );

  router.handle('sidebar:endResize', (_input, { sender }) => {
    const { tabs, layout } = windowFor(sender.webContentsId);
    layout.flush(); // save the final width now rather than after the debounce
    tabs.unfreeze();
  });
}
