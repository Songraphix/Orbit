import type { IpcRouter } from '../router';
import type { FocusService } from '../../focus/service';
import type { SoundService } from '../../focus/sounds';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * Focus mode (roadmap P2.3) and its sounds: from the shell's pill and Focus button, the overlay's
 * bar, the panel's Focus view, the "blocked" page and the hidden page that plays the sounds.
 */
export function registerFocusHandlers(
  router: IpcRouter,
  windows: WindowManager,
  focus: FocusService,
  deps: {
    sounds: SoundService;
    /** The hidden page that plays sounds (it asks what to play). */
    isSoundHost: (webContentsId: number) => boolean;
    openView: (controller: WindowController) => void;
  },
): void {
  const windowOf = (webContentsId: number) => {
    const window =
      windows.forSender(webContentsId) ??
      windows.notesPanelFor(webContentsId) ??
      windows.tabForContents(webContentsId)?.window;
    if (!window) throw new Error(`Sender ${webContentsId} has no window`);
    return window;
  };
  /** The panel's Focus view: only a window's own productivity panel. */
  const panelOf = (webContentsId: number) => {
    const window = windows.notesPanelFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} is not a productivity panel`);
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
  router.handle('focus:pause', ({ paused }, { sender }) => {
    windowOf(sender.webContentsId);
    focus.pause(paused);
  });
  router.handle('focus:restart', (_input, { sender }) => {
    windowOf(sender.webContentsId);
    focus.restart();
  });
  router.handle('focus:extend', ({ minutes }, { sender }) => {
    windowOf(sender.webContentsId);
    focus.extend(minutes);
  });
  router.handle('focus:open', (_input, { sender }) => {
    deps.openView(windowOf(sender.webContentsId));
  });
  router.handle('focus:view', (_input, { sender }) => {
    windowOf(sender.webContentsId); // the panel, or the Homepage's Focus widget
    return focus.view();
  });
  router.handle('focus:setPrefs', (patch, { sender }) => {
    panelOf(sender.webContentsId);
    return focus.setPrefs(patch);
  });
  // Only the "blocked" page in a tab: allow the site, then open it in that tab.
  router.handle('focus:allow', ({ url }, { sender }) => {
    const found = windows.tabForContents(sender.webContentsId);
    if (!found || !found.tab.state.url.startsWith('orbit://blocked/')) {
      throw new Error(`Sender ${sender.webContentsId} is not a blocked page`);
    }
    focus.allow(url);
    found.tab.load(url);
  });

  const soundSender = (webContentsId: number) => {
    if (!deps.isSoundHost(webContentsId)) windowOf(webContentsId);
  };
  router.handle('sounds:get', (_input, { sender }) => {
    soundSender(sender.webContentsId);
    return deps.sounds.state;
  });
  router.handle('sounds:play', ({ id }, { sender }) => {
    windowOf(sender.webContentsId);
    deps.sounds.play(id);
  });
  router.handle('sounds:stop', (_input, { sender }) => {
    windowOf(sender.webContentsId);
    deps.sounds.stop();
  });
  router.handle('sounds:pause', ({ paused }, { sender }) => {
    windowOf(sender.webContentsId);
    deps.sounds.setPaused(paused);
  });
  router.handle('sounds:volume', ({ volume }, { sender }) => {
    windowOf(sender.webContentsId);
    deps.sounds.setVolume(volume);
  });
}
