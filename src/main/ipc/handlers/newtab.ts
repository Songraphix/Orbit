import { NEW_TAB_URL } from '@shared/types/tabs';
import type { IpcRouter } from '../router';
import { classifyInput } from '../../omnibox/classify';
import type { WallpaperService } from '../../newtab/wallpaper-service';
import type { WindowManager } from '../../windows/window-manager';

/** Handlers for orbit://newtab. The router only lets internal pages call these. */
export function registerNewTabHandlers(
  router: IpcRouter,
  windows: WindowManager,
  wallpapers: WallpaperService,
): void {
  const ownerOf = (webContentsId: number) => {
    const owner = windows.tabForContents(webContentsId);
    // Belt and braces: the page must be a tab currently showing the new tab page.
    if (!owner || owner.tab.state.url !== NEW_TAB_URL) {
      throw new Error(`Sender ${webContentsId} is not a new tab page`);
    }
    return owner;
  };

  router.handle('newtab:get', (_input, { sender }) => {
    ownerOf(sender.webContentsId);
    return wallpapers.state();
  });

  router.handle('newtab:setWallpaper', ({ wallpaper }, { sender }) => {
    ownerOf(sender.webContentsId);
    return wallpapers.set(wallpaper);
  });

  router.handle('newtab:chooseImage', (_input, { sender }) => {
    const { window } = ownerOf(sender.webContentsId);
    return wallpapers.choose(window.win);
  });

  router.handle('newtab:navigate', ({ input }, { sender }) => {
    const { tab } = ownerOf(sender.webContentsId);
    const target = classifyInput(input);
    // Load in this same tab; TabController swaps in a fresh, unprivileged web view.
    if (target) tab.load(target.url);
  });
}
