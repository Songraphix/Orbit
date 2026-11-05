import { DEFAULT_APP_OPTIONS } from '@shared/apps';
import type { AppOptions } from '@shared/apps';
import { duplicateTabs, fromBeforeToday, sortToday } from './tidy-model';
import type { SortToday, TodayTab } from './tidy-model';
import { clipboard, Menu, ShareMenu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { Space } from '../persistence/repositories/sidebar';
import type { TabManager } from '../tabs/tab-manager';
import { childrenAt } from './model';
import { classifyInput } from '../omnibox/classify';
import type { Position, Section } from './model';
import type { SidebarStore } from './store';

/** Built-in space icons (Arc's own names map onto these). Emoji also work. */
export const SPACE_ICONS = [
  'planet',
  'cloud',
  'video',
  'briefcase',
  'home',
  'heart',
  'star',
  'music',
  'book',
  'code',
  'camera',
  'leaf',
] as const;

/** Preset themes for "Edit Theme Color" until the full picker lands. */
export const THEME_PRESETS: { name: string; colors: string[]; mode: 'dark' | 'light' }[] = [
  { name: 'Midnight', colors: ['#2b1b4a', '#14102a'], mode: 'dark' },
  { name: 'Ocean', colors: ['#0f3b57', '#0a1f33'], mode: 'dark' },
  { name: 'Forest', colors: ['#1d3b2a', '#0e2018'], mode: 'dark' },
  { name: 'Ember', colors: ['#5a1f1f', '#2a0f12'], mode: 'dark' },
  { name: 'Rose', colors: ['#f6d5dc', '#e9b8c6'], mode: 'light' },
  { name: 'Sky', colors: ['#d6e8f7', '#b9d4ee'], mode: 'light' },
  { name: 'Sand', colors: ['#efe4cf', '#dccba8'], mode: 'light' },
  { name: 'Graphite', colors: ['#2e2e33', '#1c1c20'], mode: 'dark' },
];

export type SidebarUi = {
  /** Ask the shell to start inline renaming. */
  startRename: (target: 'item' | 'space', id: string) => void;
  toast: (message: string) => void;
  openCommandBar: () => void;
  /** Runs an app command by id (e.g. 'new-boost'). */
  command: (id: string) => void;
  /** Live Folders (F-28): add one to a space, refresh, mark read. */
  liveFolders?: {
    add: (kind: 'rss' | 'pulls' | 'issues', spaceId: string) => void;
    refresh: (folderId: string | null) => void;
    markAllRead: (folderId: string) => void;
  };
  /** Tabs in the sidebar or across the top (Settings → Appearance → Tab layout). */
  tabLayout?: () => 'sidebar' | 'top';
  /** The app rail tucks away until the pointer reaches the window's edge. */
  railAutoHide?: () => boolean;
  /** Sidebar apps kept running out of sight: whether one is, and stopping it. */
  apps?: { alive: (itemId: string) => boolean; quit: (itemId: string) => void };
  /** Workspace templates (roadmap P2.5): save a Space as one, or start a Space from one. */
  templates?: {
    save: (spaceId: string) => void;
    list: () => { id: string; name: string }[];
    use: (templateId: string) => void;
  };
};

/**
 * Sidebar commands for one window: pinning, favorites, folders, spaces, Clear and the native
 * right-click menus (F-04…F-08). Structure lives in the store; live pages in the TabManager.
 */
export class SidebarActions {
  constructor(
    private readonly store: SidebarStore,
    private readonly tabs: TabManager,
    private readonly ui: SidebarUi,
  ) {}

  private get space(): Space {
    return this.tabs.space;
  }

  private at(
    section: Section,
    parentId: string | null = null,
    beforeId: string | null = null,
  ): Position {
    const space = this.space;
    return {
      section,
      profileId: space.profileId,
      spaceId: section === 'favorite' ? null : space.id,
      parentId,
      beforeId,
    };
  }

  /** ⌘D: pin a Today tab (to the end of Pinned) or unpin a pinned one (to the top of Today). */
  togglePin(itemId: string): void {
    const item = this.store.item(itemId);
    if (!item || item.kind !== 'tab') return;
    if (item.section === 'today') this.store.move(itemId, this.at('pinned'));
    else if (item.section === 'pinned') this.store.move(itemId, this.firstOf('today'));
  }

  toggleFavorite(itemId: string): void {
    const item = this.store.item(itemId);
    if (!item || item.kind !== 'tab') return;
    if (item.section === 'favorite') this.store.move(itemId, this.firstOf('pinned'));
    else this.store.move(itemId, this.at('favorite'));
  }

  move(itemId: string, section: Section, parentId: string | null, beforeId: string | null): void {
    this.store.move(itemId, this.at(section, parentId, beforeId));
  }

  newFolder(section: 'pinned' | 'today' = 'pinned'): void {
    const folder = this.store.insert(
      { kind: 'folder', title: 'New Folder' },
      { ...this.at(section), beforeId: 'first' },
    );
    this.ui.startRename('item', folder.id);
  }

  /** Deleting a folder keeps its tabs: they move up to where the folder was. */
  deleteFolder(folderId: string): void {
    const folder = this.store.item(folderId);
    if (!folder || folder.kind !== 'folder') return;
    const children = childrenAt(this.store.all(), {
      section: folder.section,
      profileId: folder.profileId,
      spaceId: folder.spaceId,
      parentId: folder.id,
    });
    for (const child of children) {
      this.store.move(child.id, {
        section: folder.section,
        profileId: folder.profileId,
        spaceId: folder.spaceId,
        parentId: folder.parentId,
        beforeId: folder.id,
      });
    }
    this.store.remove(folder.id);
  }

  /** Clear (F-03): closes every Today tab in the space. ⇧⌘T brings them back one by one. */
  clearToday(): number {
    const ids = this.store.rows('today', this.space).map((r) => r.item);
    const tabs = ids.filter((i) => i.kind === 'tab');
    for (const tab of tabs) this.tabs.close(tab.id, 'cleared');
    for (const folder of ids.filter((i) => i.kind === 'folder')) {
      if (this.store.item(folder.id)) this.store.remove(folder.id);
    }
    if (tabs.length > 0) this.ui.toast(`Cleared ${tabs.length} tab${tabs.length === 1 ? '' : 's'}`);
    return tabs.length;
  }

  /** Today tabs as the housekeeping helpers see them (roadmap P4.5): top-level tabs only. */
  private todayTabs(): TodayTab[] {
    return this.store
      .rows('today', this.space)
      .filter((r) => r.depth === 0 && r.item.kind === 'tab' && r.item.url)
      .map(({ item }) => ({
        id: item.id,
        url: item.url!,
        title: item.titleOverride || item.title,
        lastActiveAt: item.lastActiveAt,
        createdAt: item.createdAt,
      }));
  }

  /** Close Duplicate Tabs (roadmap P4.5): Today tabs that repeat a page already open here. */
  closeDuplicates(): number {
    const kept = [
      ...this.store.rows('pinned', this.space),
      ...this.store.rows('favorite', this.space),
    ]
      .map((r) => r.item.url)
      .filter((url): url is string => url !== null);
    // Tabs inside Today's folders count as open pages too (but aren't closed from here).
    const inFolders = this.store
      .rows('today', this.space)
      .filter((r) => r.depth > 0 && r.item.url)
      .map((r) => r.item.url!);
    const ids = duplicateTabs(this.todayTabs(), [...kept, ...inFolders]);
    for (const id of ids) this.tabs.close(id, 'closed');
    this.ui.toast(
      ids.length ? `Closed ${ids.length} duplicate${ids.length === 1 ? '' : 's'}` : 'No duplicates',
    );
    return ids.length;
  }

  /** Sort Today (roadmap P4.5): loose tabs by site, title or last opened; folders stay on top. */
  sortToday(by: SortToday): void {
    for (const id of sortToday(this.todayTabs(), by)) this.store.move(id, this.at('today'));
  }

  /** Archive Tabs from Before Today (roadmap P4.5): Today tabs not used since yesterday. */
  archiveBeforeToday(): number {
    const ids = fromBeforeToday(this.todayTabs(), Date.now(), this.tabs.activeItemId);
    for (const id of ids) this.tabs.close(id, 'auto');
    this.ui.toast(
      ids.length
        ? `Archived ${ids.length} tab${ids.length === 1 ? '' : 's'}`
        : 'Nothing older than today',
    );
    return ids.length;
  }

  newSpace(): void {
    const used = new Set(this.store.spaces.map((s) => s.icon));
    const icon = SPACE_ICONS.find((i) => !used.has(i)) ?? 'planet';
    const space = this.store.createSpace({
      name: 'New Space',
      icon,
      profileId: this.space.profileId,
    });
    this.tabs.switchSpace(space.id);
    this.ui.startRename('space', space.id);
  }

  deleteSpace(spaceId: string): void {
    if (this.store.spaces.length <= 1) return;
    if (spaceId === this.space.id) {
      const other = this.store.spaces.find((s) => s.id !== spaceId)!;
      this.tabs.switchSpace(other.id);
    }
    for (const item of this.store.all().filter((i) => i.spaceId === spaceId))
      this.tabs.unload(item.id);
    this.store.deleteSpace(spaceId);
  }

  /** "Export into Folder": moves all of a space's pinned items into a new folder in another space. */
  exportPinnedInto(fromSpaceId: string, toSpaceId: string): void {
    const from = this.store.space(fromSpaceId);
    const to = this.store.space(toSpaceId);
    if (!from || !to) return;
    const top = childrenAt(this.store.all(), {
      section: 'pinned',
      profileId: from.profileId,
      spaceId: from.id,
      parentId: null,
    });
    const folder = this.store.insert(
      { kind: 'folder', title: from.name },
      {
        section: 'pinned',
        profileId: to.profileId,
        spaceId: to.id,
        parentId: null,
        beforeId: null,
      },
    );
    for (const item of top) {
      this.store.move(item.id, {
        section: 'pinned',
        profileId: to.profileId,
        spaceId: to.id,
        parentId: folder.id,
        beforeId: null,
      });
    }
  }

  // ── Native menus ──────────────────────────────────────────────────────────

  itemMenu(itemId: string): void {
    const item = this.store.item(itemId);
    if (!item) return;
    const template: MenuItemConstructorOptions[] = [];
    const otherSpaces = this.store.spaces.filter((s) => s.id !== item.spaceId);

    if (item.kind === 'folder') {
      template.push(
        { label: 'Rename Folder…', click: () => this.ui.startRename('item', item.id) },
        {
          label: item.collapsed ? 'Expand' : 'Collapse',
          click: () => this.store.setCollapsed(item.id, !item.collapsed),
        },
        { type: 'separator' },
        { label: 'Delete Folder (Keep Tabs)', click: () => this.deleteFolder(item.id) },
      );
      const live = item.data?.live;
      if (live && this.ui.liveFolders) {
        const controls = this.ui.liveFolders;
        template.unshift(
          { label: 'Refresh Live Folder', click: () => controls.refresh(item.id) },
          { label: 'Mark All as Read', click: () => controls.markAllRead(item.id) },
          ...(live.error
            ? [{ label: `Last refresh failed: ${live.error}`, enabled: false }]
            : live.refreshedAt
              ? [
                  {
                    label: `Updated ${new Date(live.refreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
                    enabled: false,
                  },
                ]
              : []),
          { type: 'separator' },
        );
      }
    } else {
      if (item.section === 'today') {
        template.push({
          label: 'Pin Tab',
          accelerator: 'CmdOrCtrl+D',
          click: () => this.togglePin(item.id),
        });
      } else if (item.section === 'pinned') {
        template.push({
          label: 'Unpin Tab',
          accelerator: 'CmdOrCtrl+D',
          click: () => this.togglePin(item.id),
        });
      }
      template.push({
        label: item.section === 'favorite' ? 'Remove from Favorites' : 'Add to Favorites',
        click: () => this.toggleFavorite(item.id),
      });
      if (item.section === 'favorite') {
        // App Hub (brief M5): where this favourite opens, and which Spaces show it.
        const app = item.data?.app ?? DEFAULT_APP_OPTIONS;
        const setApp = (patch: Partial<AppOptions>) =>
          this.store.setData(item.id, { ...item.data, app: { ...app, ...patch } });
        const space = this.store.space(this.tabs.activeSpaceId);
        template.push(
          {
            label: 'Open In',
            submenu: (
              [
                ['tab', 'Tab'],
                ['panel', 'Side Panel'],
                ['window', 'Little Orbit Window'],
              ] as const
            ).map(([openIn, label]) => ({
              label,
              type: 'radio' as const,
              checked: app.openIn === openIn,
              click: () => setApp({ openIn }),
            })),
          },
          {
            label: 'Show In',
            submenu: [
              {
                label: 'All Spaces',
                type: 'radio' as const,
                checked: app.spaces === null,
                click: () => setApp({ spaces: null }),
              },
              {
                label: `Only “${space?.name ?? 'This Space'}”`,
                type: 'radio' as const,
                checked: app.spaces !== null,
                click: () => setApp({ spaces: [this.tabs.activeSpaceId] }),
              },
            ],
          },
          { label: 'Manage Apps…', click: () => this.ui.command('manage-apps') },
        );
      }
      if (item.spaceId === null || item.spaceId === this.tabs.activeSpaceId) {
        const splitIds = this.tabs.splitIds;
        template.push(
          splitIds?.includes(item.id)
            ? { label: 'Exit Split View', click: () => this.tabs.exitSplit() }
            : {
                label: 'Open in Split View',
                enabled: this.tabs.activeItemId !== null && this.tabs.activeItemId !== item.id,
                click: () => this.tabs.splitWith(item.id),
              },
        );
      }
      if (item.homeUrl && item.url && item.url !== item.homeUrl) {
        template.push({ label: 'Go Back to Pinned URL', click: () => this.tabs.goHome(item.id) });
      }
      template.push(
        { type: 'separator' },
        { label: 'Rename…', click: () => this.ui.startRename('item', item.id) },
        {
          label: 'Copy Link',
          enabled: Boolean(item.url && /^https?:/.test(item.url)),
          click: () => clipboard.writeText(item.url ?? ''),
        },
      );
      if (item.section !== 'favorite' && otherSpaces.length > 0) {
        template.push({
          label: 'Move to Space',
          submenu: otherSpaces.map((s) => ({
            label: s.name,
            click: () => {
              this.tabs.unload(item.id);
              this.store.move(item.id, {
                section: item.section,
                profileId: s.profileId,
                spaceId: s.id,
                parentId: null,
                beforeId: null,
              });
            },
          })),
        });
      }
      // Brief M6: the browser's usual tab actions.
      const live = this.tabs.get(item.id);
      const contents = live && !live.view.webContents.isDestroyed() ? live.view.webContents : null;
      const otherToday =
        item.section === 'today'
          ? this.store
              .rows('today', this.space)
              .filter((r) => r.item.kind === 'tab' && r.item.id !== item.id)
          : [];
      template.push(
        { type: 'separator' },
        {
          label: 'Duplicate',
          enabled: Boolean(item.url),
          click: () => this.tabs.create(item.url ?? undefined),
        },
        { label: 'Reload', enabled: contents !== null, click: () => contents?.reload() },
        {
          label: contents?.isAudioMuted() ? 'Unmute Tab' : 'Mute Tab',
          enabled: contents !== null,
          click: () => contents?.setAudioMuted(!contents.isAudioMuted()),
        },
        { type: 'separator' },
        {
          label: item.section === 'today' ? 'Close Tab' : 'Unload Tab',
          click: () => this.tabs.close(item.id),
        },
        ...(item.section === 'today'
          ? [
              {
                label: 'Close Other Today Tabs',
                enabled: otherToday.length > 0,
                click: () => otherToday.forEach((r) => this.tabs.close(r.item.id)),
              },
            ]
          : []),
        {
          label: 'Reopen Closed Tab',
          accelerator: 'Shift+CmdOrCtrl+T',
          click: () => this.tabs.reopenClosed(),
        },
      );
    }
    if (this.ui.apps?.alive(item.id)) {
      // An app running beside the page (or tucked away, maybe playing): stop it.
      template.push(
        { type: 'separator' },
        { label: 'Quit App', click: () => this.ui.apps?.quit(item.id) },
      );
    }
    template.push(...this.layoutItems());
    Menu.buildFromTemplate(template).popup();
  }

  /** Sidebar tabs ↔ horizontal tabs, from any tab's or bar's right-click menu (owner request). */
  private layoutItems(): MenuItemConstructorOptions[] {
    const top = this.ui.tabLayout?.() === 'top';
    return [
      { type: 'separator' },
      {
        label: top ? 'Switch to Sidebar Tabs' : 'Switch to Horizontal Tabs',
        click: () => this.ui.command('toggle-tabs-top'),
      },
    ];
  }

  /**
   * Right-click on the toolbar row, the tab row's empty space or the rail: the tab layout, and
   * the sidebar (with tabs in it) or a new tab.
   */
  barMenu(): void {
    const top = this.ui.tabLayout?.() === 'top';
    const template: MenuItemConstructorOptions[] = [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => this.ui.openCommandBar() },
      ...(top
        ? []
        : [
            {
              label: 'Show or Hide Sidebar',
              accelerator: 'CmdOrCtrl+S',
              click: () => this.ui.command('toggle-sidebar'),
            },
          ]),
      ...this.layoutItems(),
      {
        label: 'Auto-hide App Rail',
        type: 'checkbox',
        checked: this.ui.railAutoHide?.() ?? false,
        click: () => this.ui.command('toggle-rail-autohide'),
      },
    ];
    Menu.buildFromTemplate(template).popup();
  }

  /** The space context menu, matching Arc's (Img 5). */
  spaceMenu(spaceId: string): void {
    const template = this.spaceMenuTemplate(spaceId);
    if (template.length > 0) Menu.buildFromTemplate(template).popup();
  }

  /**
   * Right-click on the sidebar's empty space (like Arc): make things, paste an address, tidy up,
   * the space's own options, and the sidebar itself.
   */
  async backgroundMenu(): Promise<void> {
    const space = this.space;
    const today = this.store.rows('today', space).filter((r) => r.item.kind === 'tab').length;
    const pasted = (await clipboard.readText()).trim();
    const go = pasted && !/\s/.test(pasted) ? classifyInput(pasted) : null;
    const template: MenuItemConstructorOptions[] = [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => this.ui.openCommandBar() },
      { label: 'New Folder', click: () => this.newFolder('pinned') },
      {
        label: 'New Split View',
        accelerator: 'Ctrl+Shift+=',
        click: () => this.ui.command('split-view'),
      },
      {
        label: 'New Easel',
        accelerator: 'Ctrl+Shift+E',
        click: () => this.ui.command('new-easel'),
      },
      {
        label: 'Quick Note',
        accelerator: 'Ctrl+Shift+N',
        click: () => this.ui.command('quick-note'),
      },
      { type: 'separator' },
      {
        label: go
          ? `Paste and Go to “${pasted.length > 40 ? `${pasted.slice(0, 40)}…` : pasted}”`
          : 'Paste and Go',
        enabled: go !== null,
        click: () => go && this.tabs.create(go.url),
      },
      { type: 'separator' },
      {
        label: 'Group Tabs…',
        enabled: today >= 4,
        click: () => this.ui.command('group-tabs'),
      },
      { label: 'Tidy Today', enabled: today >= 2, click: () => this.ui.command('tidy') },
      {
        label: 'Sort Today',
        enabled: today >= 2,
        submenu: [
          { label: 'By Site', click: () => this.sortToday('site') },
          { label: 'By Title', click: () => this.sortToday('title') },
          { label: 'By Last Opened', click: () => this.sortToday('recent') },
        ],
      },
      { label: 'Close Duplicate Tabs', enabled: today >= 2, click: () => this.closeDuplicates() },
      {
        label: 'Archive Tabs from Before Today',
        enabled: today > 0,
        click: () => this.archiveBeforeToday(),
      },
      { label: 'Clear Today', enabled: today > 0, click: () => this.clearToday() },
      { type: 'separator' },
      { label: `Space “${space.name}”`, submenu: this.spaceMenuTemplate(space.id) },
      { label: 'Library', click: () => this.ui.command('library') },
      { type: 'separator' },
      {
        label: 'Hide Sidebar',
        accelerator: 'CmdOrCtrl+S',
        click: () => this.ui.command('toggle-sidebar'),
      },
      ...this.layoutItems(),
    ];
    Menu.buildFromTemplate(template).popup();
  }

  /** "New Space from Template ▸": the saved templates (roadmap P2.5). */
  private templatesSubmenu(): MenuItemConstructorOptions {
    const templates = this.ui.templates?.list() ?? [];
    return {
      label: 'New Space from Template',
      enabled: templates.length > 0,
      submenu:
        templates.length > 0
          ? templates.map((t) => ({ label: t.name, click: () => this.ui.templates?.use(t.id) }))
          : [{ label: 'No templates yet', enabled: false }],
    };
  }

  private spaceMenuTemplate(spaceId: string): MenuItemConstructorOptions[] {
    const space = this.store.space(spaceId);
    if (!space) return [];
    const others = this.store.spaces.filter((s) => s.id !== spaceId);
    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Change Space Icon',
        submenu: SPACE_ICONS.map((icon) => ({
          label: icon[0]!.toUpperCase() + icon.slice(1),
          type: 'radio',
          checked: space.icon === icon,
          click: () => this.store.updateSpace(spaceId, { icon }),
        })),
      },
      { label: 'Rename Space…', click: () => this.ui.startRename('space', spaceId) },
      {
        label: 'Save as Workspace Template',
        enabled: this.ui.templates !== undefined,
        click: () => this.ui.templates?.save(spaceId),
      },
      this.templatesSubmenu(),
      { type: 'separator' },
      {
        label: 'Edit Theme Color',
        submenu: THEME_PRESETS.map((preset) => ({
          label: preset.name,
          click: () =>
            this.store.updateSpace(spaceId, {
              theme: { ...space.theme, colors: preset.colors, mode: preset.mode },
            }),
        })),
      },
      {
        label: 'Set Profile',
        submenu: [
          ...this.store.profiles.map((p): MenuItemConstructorOptions => ({
            label: p.name,
            type: 'radio',
            checked: space.profileId === p.id,
            click: () => this.setProfile(spaceId, p.id),
          })),
          { type: 'separator' },
          {
            // A profile is a separate login identity: its own cookies, storage and permissions.
            label: 'New Profile',
            click: () => {
              const profile = this.store.createProfile(`Profile ${this.store.profiles.length + 1}`);
              this.setProfile(spaceId, profile.id);
              this.ui.toast(`${space.name} now uses ${profile.name}`);
            },
          },
        ],
      },
      { type: 'separator' },
      { label: 'New Folder', click: () => this.newFolder('pinned') },
      {
        label: 'Live Folders',
        enabled: this.ui.liveFolders !== undefined,
        submenu: [
          { label: 'Add RSS Feed…', click: () => this.ui.liveFolders?.add('rss', spaceId) },
          {
            label: 'Add GitHub Pull Requests…',
            click: () => this.ui.liveFolders?.add('pulls', spaceId),
          },
          { label: 'Add GitHub Issues…', click: () => this.ui.liveFolders?.add('issues', spaceId) },
          { type: 'separator' },
          { label: 'Refresh All', click: () => this.ui.liveFolders?.refresh(null) },
        ],
      },
      { type: 'separator' },
      {
        label: 'Share Space…',
        enabled: this.pinnedUrls(spaceId).length > 0,
        // The space's pinned links through the macOS share sheet (AirDrop, Mail, Messages, Notes…).
        click: () => new ShareMenu({ urls: this.pinnedUrls(spaceId) }).popup(),
      },
      {
        label: `Export “${space.name}” into Folder`,
        enabled: others.length > 0,
        submenu: others.map((o) => ({
          label: o.name,
          click: () => this.exportPinnedInto(spaceId, o.id),
        })),
      },
      { type: 'separator' },
      { label: 'Manage Spaces…', click: () => this.ui.command('manage-spaces') },
      { label: 'Delete Space', enabled: others.length > 0, click: () => this.deleteSpace(spaceId) },
    ];
    return template;
  }

  /** A space's pinned web links, in sidebar order (Share Space…). */
  private pinnedUrls(spaceId: string): string[] {
    const space = this.store.space(spaceId);
    if (!space) return [];
    return this.store
      .rows('pinned', space)
      .map((r) => r.item.homeUrl ?? r.item.url)
      .filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url));
  }

  /** Runs an app command for this window (the + popover's Easel, Boost and Split). */
  runCommand(id: string): void {
    this.ui.command(id);
  }

  /** Moves a space to another profile; its open pages reload in the new profile's session. */
  setProfile(spaceId: string, profileId: string): void {
    // Web pages reload signed in as the new profile. Orbit's own pages (Settings, where this is
    // often done) don't depend on the profile, so they stay put.
    for (const item of this.store.all().filter((i) => i.spaceId === spaceId)) {
      if (!(item.url ?? '').startsWith('orbit://')) this.tabs.unload(item.id);
    }
    this.store.updateSpace(spaceId, { profileId });
    const remembered = this.store.space(spaceId)?.lastActiveItemId;
    if (spaceId === this.space.id && remembered) this.tabs.activate(remembered);
  }

  private firstOf(section: Section): Position {
    const first = childrenAt(this.store.all(), this.at(section))[0]?.id ?? null;
    return this.at(section, null, first);
  }
}
