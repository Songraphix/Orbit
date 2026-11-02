import { existsSync } from 'node:fs';
import { dialog, nativeTheme } from 'electron';
import type { IpcRouter } from '../router';
import type { BoostService } from '../../boosts/service';
import type { DownloadService } from '../../downloads/service';
import type { MediaLibrary } from '../../library/media';
import { fileKindLabel, reorderTarget } from '../../library/model';
import { themeToVars } from '@shared/theme';
import type { SidebarItem } from '../../sidebar/model';
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

  router.handle('library:downloads', async ({ query }, { sender }) => {
    libraryOwner(sender.webContentsId);
    const rows = deps.downloads.history(query);
    return {
      items: await Promise.all(
        rows.map(async (d, i) => {
          const exists = d.path !== '' && existsSync(d.path);
          return {
            id: d.id,
            filename: d.filename,
            url: d.url,
            state: d.state,
            totalBytes: d.totalBytes,
            startedAt: d.startedAt,
            exists,
            kind: fileKindLabel(d.filename, d.mime),
            // Previews for the first screenfuls; older rows show a generic icon.
            thumbnail: exists && i < 80 ? await deps.downloads.preview(d.path) : null,
          };
        }),
      ),
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
    const row = ({ item, depth }: { item: SidebarItem; depth: number }) => ({
      id: item.id,
      title: item.titleOverride || item.title || item.url || 'Untitled',
      favicon: item.favicon,
      folder: item.kind === 'folder',
      depth,
    });
    const activeId = libraryOwner(sender.webContentsId).tabs.space.id;
    return {
      spaces: store.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        icon: space.icon,
        profileName: store.profiles.find((p) => p.id === space.profileId)?.name ?? 'Default',
        tabs: items.filter((i) => i.spaceId === space.id && i.kind === 'tab').length,
        active: space.id === activeId,
        pinned: store.rows('pinned', space).slice(0, 40).map(row),
        today: store.rows('today', space).slice(0, 40).map(row),
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
    } else if (action === 'menu') {
      controller.sidebar.spaceMenu(spaceId); // the space's own native menu (Img 5)
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

  router.handle('library:newSpace', (_input, { sender }) => {
    libraryOwner(sender.webContentsId).sidebar.newSpace();
  });

  router.handle('library:openItem', ({ itemId }, { sender }) => {
    const controller = libraryOwner(sender.webContentsId);
    if (controller.store.item(itemId)?.kind !== 'tab') return;
    controller.library.close(); // back to the tabs, like picking a tab in Arc's Spaces view
    controller.tabs.activate(itemId);
  });

  /** The Library page, or a tab's internal page (Easels): its window's space theme. */
  router.handle('appearance:get', (_input, { sender }) => {
    const controller =
      windows.libraryFor(sender.webContentsId) ??
      windows.notesPanelFor(sender.webContentsId) ??
      windows.tabForContents(sender.webContentsId)?.window;
    if (!controller) throw new Error(`Sender ${sender.webContentsId} has no window`);
    // The app's appearance (Settings → Appearance, or the Mac's), in the Space's colours.
    const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    return { mode, vars: themeToVars(controller.tabs.space.theme, mode) };
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
      controller.tabs.create(boostEditorUrl(id)); // opens beside the Library
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
