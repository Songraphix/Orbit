import type { IpcRouter } from '../router';
import type { CaptureService } from '../../capture/service';
import type { WindowManager } from '../../windows/window-manager';

/** Orbit Capture's card (roadmap P2.1): only the window's overlay may call these. */
export function registerCaptureHandlers(
  router: IpcRouter,
  windows: WindowManager,
  service: CaptureService,
): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller || controller.overlay.view.webContents.id !== webContentsId) {
      throw new Error(`Sender ${webContentsId} is not an overlay`);
    }
    return controller;
  };

  router.handle('capture:draft', (_input, { sender }) =>
    service.view(windowFor(sender.webContentsId)),
  );

  router.handle('capture:kind', ({ kind }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    service.setKind(controller, kind);
    return service.view(controller);
  });

  router.handle('capture:screenshot', (_input, { sender }) => {
    // Not awaited: the card steps aside while the user drags, and comes back by itself.
    void service.screenshot(windowFor(sender.webContentsId));
  });

  router.handle('capture:save', (input, { sender }) => {
    service.save(windowFor(sender.webContentsId), input);
  });

  router.handle('capture:close', (_input, { sender }) => {
    service.close(windowFor(sender.webContentsId));
  });
}
