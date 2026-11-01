import { existsSync } from 'node:fs';
import { dialog } from 'electron';
import type { IpcRouter } from '../router';
import type { BoostService } from '../../boosts/service';
import type { DownloadService } from '../../downloads/service';
import type { MediaLibrary } from '../../library/media';
import { reorderTarget } from '../../library/model';
import type { WindowController, WindowManager } from '../../windows/window-manager';
import { boostEditorUrl } from './boosts';

/**
 * Library (F-11): the shell's sidebar opens and closes it; the Library page — which is only ever
 * the window's own Library view, never a tab — reads each section and acts on it.
 */
export function registerLibraryHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    downloads: DownloadService;
    media: MediaLibrary;
    boosts: BoostService;
    toast: (controller: WindowController, message: string) => void;
  },
): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`No window for sender ${webContentsId}`);
    return controller;
  };
  /** The sender must be a window's Library page. */
  const libraryOwner = (webContentsId: number) => {
    const controller = windows.libraryFor(webContentsId);
    if (!controller) throw new Error(`Sender ${webContentsId} is not a Library page`);
    return controller;
  };

  router.handle('library:get', (_input, { sender }) => ({
    section: windowFor(sender.webContentsId).library.section,
  }));
  router.handle('library:open', ({ section }, { sender }) => {
    windowFor(sender.webContentsId).library.open(section);
  });
  router.handle('library:close', (_input, { sender }) => {
    windowFor(sender.webContentsId).library.close();
  });

  router.handle('library:media', async (_input, { sender }) => {
    libraryOwner(sender.webContentsId);
    return { items: await deps.media.list() };
  });
  router.handle('library:mediaAct', ({ id, action }, { sender }) => {
    libraryOwner(sender.webContentsId);
    deps.media.open(id, action);
  });

  router.handle('library:downloads', ({ query }, { sender }) => {
    libraryOwner(sender.webContentsId);
    return {
      items: deps.downloads.history(query).map((d) => ({
        id: d.id,
        filename: d.filename,
        url: d.url,
        state: d.state,
        totalBytes: d.totalBytes,
        startedAt: d.startedAt,
        exists: d.path !== '' && existsSync(d.path),
      })),
    };
  });
  router.handle('library:downloadAct', ({ id, action }, { sender }) => {
    libraryOwner(sender.webContentsId);
    if (action === 'open') deps.downloads.open(id);
    else deps.downloads.reveal(id);
  });

  router.handle('library:spaces', (_input, { sender }) => {
    const { store } = libraryOwner(sender.webContentsId);
    const items = store.all();
    return {
      spaces: store.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        icon: space.icon,
        profileName: store.profiles.find((p) => p.id === space.profileId)?.name ?? 'Default',
        tabs: items.filter((i) => i.spaceId === space.id && i.kind === 'tab').length,
      })),
    };
  });
  router.handle('library:spaceAct', async ({ spaceId, action, name }, { sender }) => {
    const controller = libraryOwner(sender.webContentsId);
    const { store } = controller;
    const space = store.space(spaceId);
    if (!space) return;
    if (action === 'open') {
      controller.library.close();
      controller.tabs.switchSpace(spaceId);
    } else if (action === 'rename') {
      if (name?.trim()) store.updateSpace(spaceId, { name: name.trim() });
    } else if (action === 'up' || action === 'down') {
      const target = reorderTarget(
        store.spaces.map((s) => s.id),
        spaceId,
        action === 'up' ? -1 : 1,
      );
      if (target) store.reorderSpace(spaceId, target.beforeId);
    } else {
      if (store.spaces.length <= 1) return;
      const { response } = await dialog.showMessageBox(controller.win, {
        type: 'warning',
        message: `Delete the space “${space.name}”?`,
        detail: 'Its pinned tabs, folders and Today tabs are deleted too.',
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (response === 0) controller.sidebar.deleteSpace(spaceId);
    }
  });

  router.handle('library:boosts', (_input, { sender }) => {
    libraryOwner(sender.webContentsId);
    return {
      boosts: deps.boosts
        .list()
        .map(({ id, name, domain, enabled }) => ({ id, name, domain, enabled })),
    };
  });
  router.handle('library:boostAct', async ({ id, action }, { sender }) => {
    const controller = libraryOwner(sender.webContentsId);
    const boost = deps.boosts.get(id);
    if (!boost) return;
    if (action === 'on' || action === 'off') {
      deps.boosts.update(id, { enabled: action === 'on' });
    } else if (action === 'edit') {
      controller.tabs.create(boostEditorUrl(id)); // leaves the Library
    } else {
      const { response } = await dialog.showMessageBox(controller.win, {
        type: 'warning',
        message: `Delete “${boost.name}”?`,
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (response === 0) {
        deps.boosts.delete(id);
        deps.toast(controller, `Deleted ${boost.name}`);
      }
    }
  });
}
