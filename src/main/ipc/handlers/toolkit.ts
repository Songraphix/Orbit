import type { EaselCapture } from '@shared/types/easels';
import type { IpcRouter } from '../router';
import type { ToolkitService } from '../../toolkit/service';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * The Toolkit (roadmap P3.5, P3.6). Its page is a window's productivity panel; Pick Color's
 * loupe is that window's overlay; the shell's responsive bar sets the device size.
 */
export function registerToolkitHandlers(
  router: IpcRouter,
  windows: WindowManager,
  toolkit: ToolkitService,
  /** Pictures waiting for the Easels Annotate Screenshot opened. */
  pending: Map<string, EaselCapture>,
): void {
  const panelWindow = (webContentsId: number): WindowController => {
    const controller = windows.notesPanelFor(webContentsId);
    if (!controller) throw new Error('Not the productivity panel');
    return controller;
  };
  /** The shell or overlay's window (forSender knows both), else the panel's. */
  const anyWindow = (webContentsId: number): WindowController => {
    const controller = windows.forSender(webContentsId) ?? windows.notesPanelFor(webContentsId);
    if (!controller) throw new Error('No window for this sender');
    return controller;
  };

  router.handle('toolkit:get', (_input, { sender }) =>
    toolkit.state(panelWindow(sender.webContentsId)),
  );
  router.handle('toolkit:open', ({ section }, { sender }) => {
    toolkit.open(anyWindow(sender.webContentsId), section);
  });
  router.handle('toolkit:pickColor', (_input, { sender }) =>
    toolkit.pickColor(anyWindow(sender.webContentsId)),
  );
  router.handle('toolkit:colorPicked', ({ hex }, { sender }) => {
    toolkit.colorPicked(anyWindow(sender.webContentsId), hex);
  });
  router.handle('toolkit:cancelPick', (_input, { sender }) => {
    toolkit.cancelPick(anyWindow(sender.webContentsId));
  });
  router.handle('toolkit:clearColors', (_input, { sender }) => {
    toolkit.clearColors(panelWindow(sender.webContentsId));
  });
  router.handle('toolkit:palette', (_input, { sender }) =>
    toolkit.palette(panelWindow(sender.webContentsId)),
  );
  router.handle('toolkit:servers', (_input, { sender }) =>
    toolkit.scanServers(panelWindow(sender.webContentsId)),
  );
  router.handle('toolkit:viewport', ({ viewport }, { sender }) => {
    toolkit.setViewport(anyWindow(sender.webContentsId), viewport);
  });
  router.handle('toolkit:annotate', (_input, { sender }) => {
    void toolkit.annotate(anyWindow(sender.webContentsId));
  });
  router.handle('toolkit:split', ({ url }, { sender }) => {
    const controller = panelWindow(sender.webContentsId);
    if (!/^https?:\/\//i.test(url)) return;
    if (controller.tabs.activeItemId) controller.tabs.splitWithNew(url);
    else controller.tabs.create(url);
  });
  router.handle('easels:pending', ({ id }, { sender }) => {
    // Only the Easel's own page may take its picture.
    const owner = windows.tabForContents(sender.webContentsId);
    if (!owner || owner.tab.state.url !== `orbit://easel/${id}`) return null;
    const capture = pending.get(id) ?? null;
    pending.delete(id);
    return capture;
  });
}
