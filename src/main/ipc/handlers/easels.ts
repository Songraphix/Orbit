import { dialog } from 'electron';
import type { IpcRouter } from '../router';
import type { CaptureRequests } from '../../easels/capture-requests';
import type { EaselRepository } from '../../persistence/repositories/easels';
import type { WindowController, WindowManager } from '../../windows/window-manager';

export const easelUrl = (id: string) => `orbit://easel/${id}`;

/** A new, empty Easel opened as a tab in the window's current space (⌃⇧E, + menu). */
export function newEasel(easels: EaselRepository, controller: WindowController): void {
  const easel = easels.create({ title: 'Untitled Easel', spaceId: controller.tabs.space.id });
  controller.tabs.create(easelUrl(easel.id));
}

const isWeb = (url: string) => /^https?:\/\//.test(url);

/**
 * Easels (F-19): the editor page (orbit://easel/<id>) loads and saves its own Easel and asks for
 * captures from web pages; Library → Easels lists, opens and deletes them.
 */
export function registerEaselHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    easels: EaselRepository;
    captures: CaptureRequests;
    toast: (controller: WindowController, message: string) => void;
  },
): void {
  const { easels } = deps;

  /** The sender must be the tab showing this very Easel. */
  const editorFor = (webContentsId: number, id: string) => {
    const owner = windows.tabForContents(webContentsId);
    if (!owner || owner.tab.state.url !== easelUrl(id)) {
      throw new Error(`Sender ${webContentsId} is not the editor for Easel ${id}`);
    }
    return owner;
  };
  const libraryOwner = (webContentsId: number) => {
    const controller = windows.libraryFor(webContentsId);
    if (!controller) throw new Error(`Sender ${webContentsId} is not a Library page`);
    return controller;
  };

  router.handle('easels:get', ({ id }, { sender }) => {
    editorFor(sender.webContentsId, id);
    const easel = easels.get(id);
    return easel
      ? { id: easel.id, title: easel.title, scene: easel.scene, updatedAt: easel.updatedAt }
      : null;
  });

  router.handle('easels:save', ({ id, title, scene, preview }, { sender }) => {
    editorFor(sender.webContentsId, id);
    easels.update(id, { title, scene, preview });
  });

  /**
   * "Capture": shows the page beside the Easel (or the most recent web page in this space) with
   * the area-capture overlay, then comes back with the image.
   */
  router.handle('easels:capture', async ({ id }, { sender }) => {
    const { window, tab } = editorFor(sender.webContentsId, id);
    const partnerId = window.tabs.splitIds?.find((other) => other !== tab.id);
    const partner = partnerId ? window.tabs.get(partnerId) : undefined;
    const recent = window.store
      .tabsInOrder(window.tabs.space)
      .filter((item) => item.id !== tab.id && isWeb(item.url ?? ''))
      .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))[0];
    const sourceId = partner && isWeb(partner.state.url) ? partner.id : recent?.id;
    if (!sourceId) {
      deps.toast(window, 'Open a web page to capture from');
      return null;
    }
    window.tabs.activate(sourceId);
    const source = window.tabs.get(sourceId);
    if (!source) return null;
    const result = deps.captures.wait(window);
    window.overlay.startCapture(source.view.getBounds());
    const capture = await result;
    if (window.tabs.get(tab.id)) window.tabs.activate(tab.id); // back to the Easel
    return capture;
  });

  router.handle('library:easels', (_input, { sender }) => {
    libraryOwner(sender.webContentsId);
    return {
      easels: easels.list().map(({ id, title, preview, updatedAt }) => ({
        id,
        title,
        preview,
        updatedAt,
      })),
    };
  });

  router.handle('library:easelAct', async ({ id, action }, { sender }) => {
    const controller = libraryOwner(sender.webContentsId);
    if (action === 'new') {
      newEasel(easels, controller);
      return;
    }
    const easel = easels.get(id ?? '');
    if (!easel) return;
    if (action === 'open') {
      controller.tabs.create(easelUrl(easel.id)); // leaves the Library
      return;
    }
    const { response } = await dialog.showMessageBox(controller.win, {
      type: 'warning',
      message: `Delete “${easel.title}”?`,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 0) {
      easels.delete(easel.id);
      deps.toast(controller, `Deleted ${easel.title}`);
    }
  });
}
