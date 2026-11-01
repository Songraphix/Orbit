import { app, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export type NavigateAction = 'back' | 'forward' | 'reload' | 'hardReload' | 'stop';

export type AppMenuActions = {
  toggleSidebar: () => void;
  /** ⌘T: command bar ("new"); ⌘L: command bar with the current URL ("edit"). */
  openCommandBar: (mode: 'new' | 'edit') => void;
  /** The wallpaper new tab page (also the sidebar's "+ New Tab" row). */
  newTabPage: () => void;
  /** Runs a shared command by id (close-tab, reopen-tab, copy-url…). */
  command: (id: string) => void;
  copyUrlAsMarkdown: () => void;
  /** Acts on the focused window's active tab. */
  navigate: (action: NavigateAction) => void;
  /** Opens DevTools for the active tab's page (⌥⌘I). */
  toggleTabDevTools: () => void;
  /** Next (1) / previous (-1) tab. */
  cycleTab: (direction: 1 | -1) => void;
  /** ⌘1…⌘9. */
  goToTab: (n: number) => void;
};

/**
 * The native menu bar (F-15). Accelerators here fire even when a web page has focus.
 * Skeleton for now; Phase 1 step 10 fills it out, later phases add Spaces, Archive, …
 */
export function installAppMenu(actions: AppMenuActions): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        // ⌘T opens the command bar (owner's choice, F-32); the new tab page has its own item
        // and the sidebar's "+ New Tab" row.
        {
          id: 'new-tab',
          label: 'New Tab…',
          accelerator: 'CmdOrCtrl+T',
          click: () => actions.openCommandBar('new'),
        },
        { id: 'new-tab-page', label: 'New Tab Page', click: actions.newTabPage },
        {
          id: 'open-location',
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: () => actions.openCommandBar('edit'),
        },
        { type: 'separator' },
        // ⌘W closes the tab, never the window (the default role would close the window).
        {
          id: 'close-tab',
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => actions.command('close-tab'),
        },
        {
          id: 'reopen-tab',
          label: 'Reopen Closed Tab',
          accelerator: 'Shift+CmdOrCtrl+T',
          click: () => actions.command('reopen-tab'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          id: 'copy-url',
          label: 'Copy URL',
          accelerator: 'Shift+CmdOrCtrl+C',
          click: () => actions.command('copy-url'),
        },
        {
          id: 'copy-url-markdown',
          label: 'Copy URL as Markdown',
          accelerator: 'Shift+Alt+CmdOrCtrl+C',
          click: actions.copyUrlAsMarkdown,
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'toggle-sidebar',
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+S',
          click: actions.toggleSidebar,
        },
        { type: 'separator' },
        {
          id: 'reload',
          label: 'Reload Page',
          accelerator: 'CmdOrCtrl+R',
          click: () => actions.navigate('reload'),
        },
        {
          id: 'hard-reload',
          label: 'Force Reload Page',
          accelerator: 'Shift+CmdOrCtrl+R',
          click: () => actions.navigate('hardReload'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Developer',
          submenu: [
            {
              id: 'tab-devtools',
              label: 'Developer Tools',
              accelerator: 'Alt+CmdOrCtrl+I',
              click: actions.toggleTabDevTools,
            },
            // Orbit's own UI, for debugging Orbit itself; development builds only.
            ...(app.isPackaged
              ? []
              : ([
                  { label: 'Orbit Shell DevTools', role: 'toggleDevTools', accelerator: '' },
                ] satisfies MenuItemConstructorOptions[])),
          ],
        },
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        {
          id: 'next-tab',
          label: 'Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => actions.cycleTab(1),
        },
        {
          id: 'previous-tab',
          label: 'Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => actions.cycleTab(-1),
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i): MenuItemConstructorOptions => ({
          id: `go-to-tab-${i + 1}`,
          label: i === 8 ? 'Go to Last Tab' : `Go to Tab ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => actions.goToTab(i + 1),
        })),
      ],
    },
    {
      label: 'History',
      submenu: [
        {
          id: 'back',
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => actions.navigate('back'),
        },
        {
          id: 'forward',
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => actions.navigate('forward'),
        },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
