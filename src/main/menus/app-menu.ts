import { app, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export type AppMenuActions = {
  toggleSidebar: () => void;
  newTab: () => void;
  closeTab: () => void;
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
        { role: 'togglefullscreen' },
        ...(app.isPackaged
          ? []
          : ([
              { type: 'separator' },
              { label: 'Developer', submenu: [{ role: 'toggleDevTools' }] },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
