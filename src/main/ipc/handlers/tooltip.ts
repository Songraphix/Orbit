import type { IpcRouter } from '../router';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * Arc-style tooltips, drawn by the window's overlay: for the shell's (and the slid-out
 * sidebar's) controls, and for Orbit's own pages beside or in the page area — the productivity
 * panel, the Library, an orbit:// tab — whose anchors are moved into window coordinates.
 */
export function registerTooltipHandlers(router: IpcRouter, windows: WindowManager): void {
  const ownerOf = (
    webContentsId: number,
  ): { window: WindowController; offset: { x: number; y: number } } | null => {
    const shell = windows.forSender(webContentsId);
    if (shell) return { window: shell, offset: { x: 0, y: 0 } };
    const panel = windows.notesPanelFor(webContentsId);
    const panelBounds = panel?.notes.bounds;
    if (panel && panelBounds) return { window: panel, offset: panelBounds };
    const library = windows.libraryFor(webContentsId);
    const libraryBounds = library?.library.bounds;
    if (library && libraryBounds) return { window: library, offset: libraryBounds };
    const tab = windows.tabForContents(webContentsId);
    if (tab) return { window: tab.window, offset: tab.tab.view.getBounds() };
    return null;
  };
  router.handle('tooltip:show', (tip, { sender }) => {
    const owner = ownerOf(sender.webContentsId);
    if (!owner) return;
    const { x, y } = owner.offset;
    owner.window.overlay.showTooltip({
      ...tip,
      anchor: { ...tip.anchor, x: tip.anchor.x + x, y: tip.anchor.y + y },
    });
  });
  router.handle('tooltip:hide', (_input, { sender }) => {
    ownerOf(sender.webContentsId)?.window.overlay.hideTooltip();
  });
}
