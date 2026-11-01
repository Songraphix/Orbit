import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';

/** Tooltips for the shell's (and the slid-out sidebar's) controls, drawn by the overlay. */
export function registerTooltipHandlers(router: IpcRouter, windows: WindowManager): void {
  router.handle('tooltip:show', (tip, { sender }) => {
    windows.forSender(sender.webContentsId)?.overlay.showTooltip(tip);
  });
  router.handle('tooltip:hide', (_input, { sender }) => {
    windows.forSender(sender.webContentsId)?.overlay.hideTooltip();
  });
}
