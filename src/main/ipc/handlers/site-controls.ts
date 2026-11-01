import { clipboard, ClipboardItem, dialog, Menu, ShareMenu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { Rect } from '@shared/types/layout';
import type { SiteControlsView } from '@shared/types/site-controls';
import type { IpcRouter } from '../router';
import type { SiteSettingsRepository } from '../../persistence/repositories/site-settings';
import { siteSettingRows, storedValueFor } from '../../site-controls/model';
import type { ExtensionHost } from '../../extensions/host';
import { webStoreIdFrom } from '../../extensions/model';
import { cropToPage } from '../../site-controls/capture';
import type { WindowController, WindowManager } from '../../windows/window-manager';

export type SiteControlsDeps = {
  siteSettings: SiteSettingsRepository;
  extensions: ExtensionHost;
  toast: (controller: WindowController, message: string) => void;
  /** ⌘0 for the active page. */
  resetZoom: (controller: WindowController) => void;
};

/**
 * The site controls popover (F-12, Img 3): quick actions, settings for this site, and the
 * footer menu. Drawn by the overlay; everything acts on the window's active tab.
 */
export function registerSiteControlsHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: SiteControlsDeps,
): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller;
  };

  const activeSite = (controller: WindowController) => {
    const tab = controller.tabs.active;
    if (!tab || tab.state.kind !== 'web') return null;
    try {
      const url = new URL(tab.state.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return {
        tab,
        url: tab.state.url,
        origin: url.origin,
        host: url.host,
        secure: url.protocol === 'https:',
      };
    } catch {
      return null;
    }
  };

  const build = (controller: WindowController, anchor: Rect): SiteControlsView | null => {
    const site = activeSite(controller);
    if (!site) return null;
    return {
      anchor,
      url: site.url,
      host: site.host,
      secure: site.secure,
      settings: siteSettingRows(deps.siteSettings.all(site.origin), site.url),
      extensions: deps.extensions.actions(site.tab.view.webContents),
      storeExtension: storeExtension(site.url, site.tab.view.webContents.session),
      openedAt: Date.now(),
    };
  };

  const storeExtension = (url: string, session: Electron.Session) => {
    const id = webStoreIdFrom(url);
    return id ? { id, installed: deps.extensions.isInstalled(session, id) } : null;
  };

  router.handle('extensions:activate', ({ id, anchor, menu }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    const site = activeSite(controller);
    if (!site) return;
    controller.overlay.closeSiteControls(); // popups are windows of their own
    const contents = site.tab.view.webContents;
    if (!menu) {
      deps.extensions.activate(contents, id, anchor);
      return;
    }
    const info = deps.extensions.info(contents.session, id);
    if (!info) return;
    Menu.buildFromTemplate([
      { label: info.name, enabled: false },
      { type: 'separator' },
      {
        label: 'Options',
        enabled: info.optionsUrl !== null,
        click: () => info.optionsUrl && controller.tabs.create(info.optionsUrl),
      },
      {
        label: `Remove “${info.name}” from Orbit…`,
        click: async () => {
          const { response } = await dialog.showMessageBox(controller.win, {
            type: 'warning',
            message: `Remove “${info.name}”?`,
            buttons: ['Remove', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
          });
          if (response !== 0) return;
          await deps.extensions.uninstall(id);
          deps.toast(controller, `Removed ${info.name}`);
        },
      },
    ]).popup({
      window: controller.win,
      x: Math.round(anchor.x),
      y: Math.round(anchor.y + anchor.height),
    });
  });

  router.handle('extensions:install', async (_input, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    const site = activeSite(controller);
    const id = site ? webStoreIdFrom(site.url) : null;
    if (!site || !id) return;
    controller.overlay.closeSiteControls();
    try {
      const name = await deps.extensions.install(id, controller.win);
      if (name) deps.toast(controller, `Added ${name}`);
    } catch (error) {
      console.error('[orbit] extension install failed', error);
      await dialog.showMessageBox(controller.win, {
        type: 'error',
        message: 'Couldn’t add this extension',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.handle('extensions:openStore', (_input, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    controller.overlay.closeSiteControls();
    controller.tabs.create('https://chromewebstore.google.com/category/extensions');
  });

  /** Re-reads the settings after a change, keeping the popover where it is. */
  const refresh = (controller: WindowController) => {
    const anchor = controller.overlay.current.siteControls?.anchor;
    const view = anchor ? build(controller, anchor) : null;
    if (view) controller.overlay.showSiteControls(view);
    else controller.overlay.closeSiteControls();
    controller.tabs.refresh(); // Developer Mode changes the toolbar
  };

  router.handle('sitecontrols:open', ({ anchor }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    if (controller.overlay.siteControlsOpen) {
      controller.overlay.closeSiteControls(); // the button toggles
      return;
    }
    controller.peek.close();
    const view = build(controller, anchor);
    if (view) controller.overlay.showSiteControls(view);
  });

  router.handle('sitecontrols:close', (_input, { sender }) => {
    windowFor(sender.webContentsId).overlay.closeSiteControls();
  });

  // A settings row: its choices as a native menu, the current one ticked.
  router.handle('sitecontrols:pick', ({ key, value }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    const site = activeSite(controller);
    const row = site
      ? siteSettingRows(deps.siteSettings.all(site.origin), site.url).find((r) => r.key === key)
      : undefined;
    if (!site || !row) return;
    const choose = (choice: string) => {
      const { ok, stored } = storedValueFor(key, choice);
      if (!ok) return;
      deps.siteSettings.set(site.origin, key, stored);
      refresh(controller);
    };
    if (value !== undefined) {
      choose(value);
      return;
    }
    const template: MenuItemConstructorOptions[] = row.options.map((option) => ({
      type: 'radio',
      label: option.label,
      checked: option.value === row.value,
      click: () => choose(option.value),
    }));
    Menu.buildFromTemplate(template).popup({ window: controller.win });
  });

  router.handle('sitecontrols:action', async ({ action }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    const site = activeSite(controller);
    if (!site) return;
    if (action === 'more') {
      moreMenu(controller, site);
      return;
    }
    controller.overlay.closeSiteControls();
    if (action === 'copyUrl') {
      clipboard.writeText(site.url);
      deps.toast(controller, 'Copied link');
    } else if (action === 'share') {
      new ShareMenu({ urls: [site.url] }).popup({ window: controller.win });
    } else if (action === 'screenshot') {
      // Drag an area over the page (the overlay draws it); a click takes the whole page.
      controller.overlay.startCapture(site.tab.view.getBounds());
    }
  });

  router.handle('capture:take', async ({ rect }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    const site = activeSite(controller);
    controller.overlay.endCapture();
    if (!site) return;
    const area = site.tab.view.getBounds();
    const crop = rect ? cropToPage(rect, area) : undefined;
    if (crop === null) return;
    const image = await site.tab.view.webContents.capturePage(crop);
    if (image.isEmpty()) return;
    const png = new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    deps.toast(controller, 'Screenshot copied');
  });

  router.handle('capture:cancel', (_input, { sender }) => {
    windowFor(sender.webContentsId).overlay.endCapture();
  });

  /** The footer's "…": copy, zoom reset, clear site data. */
  function moreMenu(
    controller: WindowController,
    site: NonNullable<ReturnType<typeof activeSite>>,
  ): void {
    const contents = site.tab.view.webContents;
    Menu.buildFromTemplate([
      {
        label: 'Copy Link',
        click: () => {
          clipboard.writeText(site.url);
          deps.toast(controller, 'Copied link');
        },
      },
      {
        label: 'Reset Zoom',
        enabled: contents.getZoomLevel() !== 0,
        click: () => deps.resetZoom(controller),
      },
      { type: 'separator' },
      {
        label: `Clear Data for ${site.host}…`,
        click: () => void clearSiteData(controller, site),
      },
    ]).popup({ window: controller.win });
  }

  async function clearSiteData(
    controller: WindowController,
    site: NonNullable<ReturnType<typeof activeSite>>,
  ): Promise<void> {
    const { response } = await dialog.showMessageBox(controller.win, {
      type: 'warning',
      message: `Clear cookies and site data for ${site.host}?`,
      detail: 'You’ll be signed out of this site.',
      buttons: ['Clear', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return;
    const contents = site.tab.view.webContents;
    await contents.session.clearStorageData({ origin: site.origin });
    controller.overlay.closeSiteControls();
    if (!contents.isDestroyed()) contents.reload();
    deps.toast(controller, 'Cleared site data');
  }
}
