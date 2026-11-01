import { dialog } from 'electron';
import type { IpcRouter } from '../router';
import type { BoostService } from '../../boosts/service';
import { matchesDomain } from '../../boosts/model';
import type { TabController } from '../../tabs/tab-controller';
import type { WindowController, WindowManager } from '../../windows/window-manager';

export const boostEditorUrl = (id: string) => `orbit://boost/${id}`;

/** Opens a Boost's editor beside the current page (split view), so edits preview live. */
export function openBoostEditor(controller: WindowController, id: string): void {
  const active = controller.tabs.active;
  if (active?.state.kind === 'web') controller.tabs.splitWithNew(boostEditorUrl(id));
  else controller.tabs.create(boostEditorUrl(id));
}

/** Zap mode on `page` until Esc, then a toast with the count. */
export async function zapPage(
  boosts: BoostService,
  controller: WindowController,
  page: TabController,
  boostId: string,
  toast: (controller: WindowController, message: string) => void,
): Promise<void> {
  page.view.webContents.focus(); // so Esc reaches the picker
  const count = await boosts.zap(page.view.webContents, boostId);
  if (count > 0) toast(controller, `Zapped ${count} element${count === 1 ? '' : 's'}`);
}

/** Handlers for the Boost editor page (orbit://boost/<id>, internal surface only). */
export function registerBoostHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    boosts: BoostService;
    toast: (controller: WindowController, message: string) => void;
  },
): void {
  const { boosts } = deps;

  /** The sender must be the editor tab for this very Boost. */
  const editorFor = (webContentsId: number, id: string) => {
    const owner = windows.tabForContents(webContentsId);
    if (!owner || owner.tab.state.url !== boostEditorUrl(id)) {
      throw new Error(`Sender ${webContentsId} is not the editor for Boost ${id}`);
    }
    return owner;
  };

  router.handle('boosts:get', ({ id }, { sender }) => {
    editorFor(sender.webContentsId, id);
    return boosts.get(id);
  });

  router.handle('boosts:update', ({ id, patch }, { sender }) => {
    editorFor(sender.webContentsId, id);
    try {
      return { boost: boosts.update(id, patch), error: null };
    } catch (error) {
      return {
        boost: boosts.get(id),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  router.handle('boosts:delete', async ({ id }, { sender }) => {
    const { window, tab } = editorFor(sender.webContentsId, id);
    const boost = boosts.get(id);
    if (!boost) return;
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete “${boost.name}”?`,
      detail: boost.domain ? `${boost.domain} goes back to how it looks without it.` : undefined,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return;
    boosts.delete(id);
    window.tabs.close(tab.id);
    deps.toast(window, `Deleted ${boost.name}`);
  });

  router.handle('boosts:zap', async ({ id }, { sender }) => {
    const { window, tab } = editorFor(sender.webContentsId, id);
    const boost = boosts.get(id);
    if (!boost) return;
    // The page beside the editor, if it's one this Boost applies to.
    const partnerId = window.tabs.splitIds?.find((other) => other !== tab.id);
    const page = partnerId ? window.tabs.get(partnerId) : undefined;
    if (!page || !matchesDomain(boost.domain, page.state.url)) {
      deps.toast(
        window,
        boost.domain ? `Open ${boost.domain} beside the editor to zap` : 'Set a website first',
      );
      return;
    }
    window.tabs.activate(page.id);
    await zapPage(boosts, window, page, id, deps.toast);
  });

  router.handle('boosts:reloadPages', ({ id }, { sender }) => {
    editorFor(sender.webContentsId, id);
    boosts.reloadPages(id);
  });
}
