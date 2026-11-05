import type { WindowController } from '../windows/window-manager';

/**
 * Opens a favourite the way it's set to (App Hub): in the docked panel (again: closes it), in
 * its own small window, or as a tab. From the rail it always opens beside the page. Clicking it and Orbit AI's open_app both come here.
 * Returns false when it isn't there.
 */
export function openFavorite(
  controller: WindowController,
  itemId: string,
  openWindow: ((url: string) => void) | undefined,
  /** `panel`: open beside the page whatever it's set to (the rail, like Opera's sidebar) —
   *  unless it's set to its own window. */
  options: { toggle?: boolean; panel?: boolean } = {},
): boolean {
  const item = controller.store.item(itemId);
  if (!item) return false;
  const set = item.section === 'favorite' ? item.data?.app?.openIn : undefined;
  const openIn = options.panel && item.section === 'favorite' && set !== 'window' ? 'panel' : set;
  const url = item.homeUrl ?? item.url;
  if (url && openIn === 'panel') {
    if (options.toggle) controller.appPanel.toggle(item.id, url);
    else controller.appPanel.open(item.id, url);
    return true;
  }
  if (url && openIn === 'window' && openWindow) {
    openWindow(url);
    return true;
  }
  controller.tabs.activate(itemId);
  return true;
}
