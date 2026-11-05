import { APP_CATALOG, appUrl, showsIn } from '@shared/apps';
import type { OpenIn } from '@shared/apps';
import type { WindowController } from '../windows/window-manager';

/** The App Library (redesign brief §7): your apps, and the catalogue to add from. */
export type AppLibraryView = {
  apps: {
    id: string;
    title: string;
    host: string;
    favicon: string | null;
    openIn: OpenIn;
    /** Showing now: in the side panel, or a live tab. */
    open: boolean;
  }[];
  catalog: { group: string; apps: { name: string; url: string; host: string; added: boolean }[] }[];
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export function appLibraryView(controller: WindowController): AppLibraryView {
  const { store, tabs, appPanel } = controller;
  const space = tabs.space;
  const apps = store
    .rows('favorite', space)
    .filter(({ item }) => item.kind === 'tab' && showsIn(item.data?.app, space.id))
    .map(({ item }) => {
      const url = item.homeUrl ?? item.url ?? '';
      return {
        id: item.id,
        title: item.titleOverride || item.title || hostOf(url) || 'App',
        host: hostOf(url),
        favicon: item.favicon,
        openIn: item.data?.app?.openIn ?? ('tab' as const),
        open: appPanel.openItemId === item.id || tabs.get(item.id) !== undefined,
      };
    });
  const hosts = new Set(apps.map((a) => a.host));
  return {
    apps,
    catalog: APP_CATALOG.map((group) => ({
      group: group.group,
      apps: group.apps.map((a) => ({
        name: a.name,
        url: a.url,
        host: hostOf(a.url),
        added: hosts.has(hostOf(a.url)),
      })),
    })),
  };
}

/** Adds a site as an app (a favourite of the window's profile, shown in every Space). */
export function addApp(controller: WindowController, url: string, title?: string): string {
  const address = appUrl(url);
  if (!address) throw new Error('That isn’t a web address');
  const space = controller.tabs.space;
  const item = controller.store.insert(
    { kind: 'tab', title: title?.trim() || hostOf(address), url: address },
    {
      section: 'favorite',
      profileId: space.profileId,
      spaceId: null,
      parentId: null,
      beforeId: null,
    },
  );
  controller.store.setHome(item.id, address);
  if (title?.trim()) controller.store.rename(item.id, title.trim());
  return item.id;
}
