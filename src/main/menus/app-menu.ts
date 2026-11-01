import { app, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export type NavigateAction = 'back' | 'forward' | 'reload' | 'hardReload' | 'stop';

export type AppMenuActions = {
  toggleSidebar: () => void;
  newTab: () => void;
  closeTab: () => void;
  /** Acts on the focused window's active tab. */
  navigate: (action: NavigateAction) => void;
  /** Opens DevTools for the active tab's page (⌥⌘I). */
  toggleTabDevTools: () => void;
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
        // ⌘T opens the new tab page; it moves to the command bar in Phase 2 (the sidebar's
        // "+ New Tab" row keeps opening the page).
        { id: 'new-tab', label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: actions.newTab },
        { type: 'separator' },
        // ⌘W closes the tab, never the window (the default role would close the window).
        {
          id: 'close-tab',
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: actions.closeTab,
        },
      ],
    },
    { role: 'editMenu' },
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
