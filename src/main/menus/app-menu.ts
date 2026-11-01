import { app, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export type AppMenuActions = {
  toggleSidebar: () => void;
};

/**
 * The native menu bar (F-15). Accelerators here fire even when a web page has focus.
 * Skeleton for now; Phase 1 step 10 adds File/Tabs items, later phases add Spaces, Archive, …
 */
export function installAppMenu(actions: AppMenuActions): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
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
