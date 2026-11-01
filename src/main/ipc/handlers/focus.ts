import type { IpcRouter } from '../router';
import type { FocusService } from '../../focus/service';
import type { WindowManager } from '../../windows/window-manager';

/** Focus mode (roadmap P2.3): from the shell's pill, the overlay's bar, or the panel's tasks. */
export function registerFocusHandlers(
  router: IpcRouter,
  windows: WindowManager,
  focus: FocusService,
): void {
  const windowOf = (webContentsId: number) => {
    const window = windows.forSender(webContentsId) ?? windows.notesPanelFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} has no window`);
    return window;
  };
  router.handle('focus:get', (_input, { sender }) => {
    windowOf(sender.webContentsId);
    return focus.session;
  });
  router.handle('focus:start', (input, { sender }) => {
    focus.start(windowOf(sender.webContentsId), input);
  });
  router.handle('focus:end', ({ complete }, { sender }) => {
    focus.end(windowOf(sender.webContentsId), complete);
  });
}
