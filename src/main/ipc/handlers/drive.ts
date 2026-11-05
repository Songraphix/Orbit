import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';
import type { DriveService } from '../../drive/service';

/** Google Drive (roadmap R2 M3): Settings → Integrations connects and disconnects it. */
export function registerDriveHandlers(
  router: IpcRouter,
  windows: WindowManager,
  drive: DriveService,
): void {
  const settingsOnly = (webContentsId: number) => {
    if (!windows.settingsFor(webContentsId))
      throw new Error(`Sender ${webContentsId} is not Settings`);
  };
  router.handle('drive:status', () => drive.status());
  router.handle('drive:connect', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return drive.connect();
  });
  router.handle('drive:cancel', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    drive.cancel();
  });
  router.handle('drive:disconnect', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return drive.disconnect();
  });
}
