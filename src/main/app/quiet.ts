import { app, BrowserWindow } from 'electron';

/**
 * Quiet mode for automated test runs (ORBIT_QUIET=1, development builds only): Orbit's windows
 * open without taking focus and it stays out of the Dock, so tests can run while you keep
 * working. Tests drive pages through DevTools, which doesn't need the window to be in front.
 */
export function enableQuietMode(): void {
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
  const proto = BrowserWindow.prototype as BrowserWindow;
  proto.show = function show(this: BrowserWindow) {
    this.showInactive();
  };
  proto.focus = () => undefined;
  app.focus = () => undefined;
  // Focusing a page makes macOS bring the app forward; tests type into pages directly instead.
  app.on('web-contents-created', (_event, contents) => {
    contents.focus = () => undefined;
  });
}
