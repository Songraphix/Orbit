import { app, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';

export type NavigateAction = 'back' | 'forward' | 'reload' | 'hardReload' | 'stop';

export type AppMenuActions = {
  toggleSidebar: () => void;
  /** ⌘T: command bar ("new"); ⌘L: command bar with the current URL ("edit"). */
  openCommandBar: (mode: 'new' | 'edit') => void;
  /** The wallpaper new tab page (also the sidebar's "+ New Tab" row). */
  newTabPage: () => void;
  /** ⌥⌘N: an empty Little Orbit window. */
  newLittleWindow: () => void;
  /** Runs a shared command by id (close-tab, reopen-tab, copy-url…). */
  command: (id: string) => void;
  copyUrlAsMarkdown: () => void;
  /** ⌘F opens find; ⌘G / ⇧⌘G step through matches. */
  find: (action: 'open' | 'next' | 'previous') => void;
  /** ⌘+ / ⌘− / ⌘0. */
  zoom: (action: 'in' | 'out' | 'reset') => void;
  print: () => void;
  /** ⌘D: pin / unpin the active tab. */
  togglePin: () => void;
  newSpace: () => void;
  newFolder: () => void;
  importFromArc: () => void;
  /** Debug: run the auto-archive and sleep passes now. */
  runLifecycle: () => void;
  /** ⌃1…⌃9. */
  goToSpace: (n: number) => void;
  /** ⌘⌥← / ⌘⌥→. */
  cycleSpace: (direction: 1 | -1) => void;
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
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          id: 'settings',
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => actions.command('settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
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
          id: 'new-little',
          label: 'New Little Orbit Window',
          accelerator: 'Alt+CmdOrCtrl+N',
          click: actions.newLittleWindow,
        },
        {
          id: 'new-easel',
          label: 'New Easel',
          accelerator: 'Ctrl+Shift+E',
          click: () => actions.command('new-easel'),
        },
        {
          id: 'open-pdf',
          label: 'Open PDF…',
          accelerator: 'CmdOrCtrl+O',
          click: () => actions.command('open-pdf'),
        },
        {
          id: 'screenshot',
          label: 'Take Screenshot',
          accelerator: 'Shift+CmdOrCtrl+2',
          click: () => actions.command('screenshot'),
        },
        {
          id: 'capture',
          label: 'Save to Orbit…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => actions.command('capture'),
        },
        { id: 'new-note', label: 'New Note', click: () => actions.command('new-note') },
        {
          id: 'quick-note',
          label: 'Quick Note',
          accelerator: 'Ctrl+Shift+N',
          click: () => actions.command('quick-note'),
        },
        {
          id: 'float-note',
          label: 'New Floating Note',
          click: () => actions.command('float-note'),
        },
        {
          id: 'open-location',
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: () => actions.openCommandBar('edit'),
        },
        { type: 'separator' },
        { id: 'import-arc', label: 'Import from Arc…', click: actions.importFromArc },
        { type: 'separator' },
        { id: 'print', label: 'Print…', accelerator: 'CmdOrCtrl+P', click: actions.print },
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
          id: 'find',
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => actions.find('open'),
        },
        {
          id: 'find-next',
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => actions.find('next'),
        },
        {
          id: 'find-previous',
          label: 'Find Previous',
          accelerator: 'Shift+CmdOrCtrl+G',
          click: () => actions.find('previous'),
        },
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
        {
          id: 'library',
          label: 'Library',
          accelerator: 'Alt+CmdOrCtrl+L',
          click: () => actions.command('library'),
        },
        {
          id: 'toggle-tabs-top',
          label: 'Toggle Tabs on Top',
          click: () => actions.command('toggle-tabs-top'),
        },
        {
          id: 'toggle-notes',
          label: 'Toggle Notes',
          accelerator: 'Shift+CmdOrCtrl+N',
          click: () => actions.command('toggle-notes'),
        },
        {
          id: 'assistant',
          label: 'Ask Orbit',
          accelerator: 'CmdOrCtrl+J',
          click: () => actions.command('assistant'),
        },
        {
          id: 'summarize-page',
          label: 'Summarize Page',
          click: () => actions.command('summarize-page'),
        },
        {
          id: 'voice',
          label: 'Voice Command',
          accelerator: 'Shift+CmdOrCtrl+Space',
          click: () => actions.command('voice'),
        },
        { id: 'toolkit', label: 'Toolkit', click: () => actions.command('toolkit') },
        {
          id: 'toggle-appearance',
          label: 'Toggle Light / Dark',
          accelerator: 'Alt+CmdOrCtrl+D',
          click: () => actions.command('toggle-appearance'),
        },
        {
          id: 'focus-open',
          label: 'Focus & Sounds…',
          accelerator: 'Alt+CmdOrCtrl+F',
          click: () => actions.command('focus-open'),
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
        {
          id: 'zoom-in',
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => actions.zoom('in'),
        },
        // ⌘= is what the + key types without Shift.
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          visible: false,
          click: () => actions.zoom('in'),
        },
        {
          id: 'zoom-out',
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => actions.zoom('out'),
        },
        {
          id: 'zoom-reset',
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => actions.zoom('reset'),
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
            // The Toolkit's page tools (roadmap P3.5, P3.6).
            {
              id: 'responsive',
              label: 'Responsive Design Mode',
              accelerator: 'Alt+CmdOrCtrl+R',
              click: () => actions.command('responsive'),
            },
            {
              id: 'pick-color',
              label: 'Pick Color',
              accelerator: 'Ctrl+Shift+C',
              click: () => actions.command('pick-color'),
            },
            {
              id: 'annotate-screenshot',
              label: 'Annotate Screenshot…',
              click: () => actions.command('annotate-screenshot'),
            },
            // Orbit's own UI, for debugging Orbit itself; development builds only.
            ...(app.isPackaged
              ? []
              : ([
                  { type: 'separator' },
                  { label: 'Orbit Shell DevTools', role: 'toggleDevTools', accelerator: '' },
                  {
                    id: 'run-lifecycle',
                    label: 'Archive & Sleep Now',
                    click: actions.runLifecycle,
                  },
                ] satisfies MenuItemConstructorOptions[])),
          ],
        },
      ],
    },
    {
      label: 'Spaces',
      submenu: [
        { id: 'new-space', label: 'New Space', click: actions.newSpace },
        { id: 'new-folder', label: 'New Folder', click: actions.newFolder },
        {
          label: 'Add Live Folder',
          submenu: [
            { id: 'live-rss', label: 'RSS Feed…', click: () => actions.command('live-rss') },
            {
              id: 'live-pulls',
              label: 'GitHub Pull Requests…',
              click: () => actions.command('live-pulls'),
            },
            {
              id: 'live-issues',
              label: 'GitHub Issues…',
              click: () => actions.command('live-issues'),
            },
          ],
        },
        {
          id: 'live-refresh',
          label: 'Refresh Live Folders',
          click: () => actions.command('live-refresh'),
        },
        { type: 'separator' },
        {
          id: 'next-space',
          label: 'Next Space',
          accelerator: 'Alt+CmdOrCtrl+Right',
          click: () => actions.cycleSpace(1),
        },
        {
          id: 'previous-space',
          label: 'Previous Space',
          accelerator: 'Alt+CmdOrCtrl+Left',
          click: () => actions.cycleSpace(-1),
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i): MenuItemConstructorOptions => ({
          id: `go-to-space-${i + 1}`,
          label: `Go to Space ${i + 1}`,
          accelerator: `Ctrl+${i + 1}`,
          click: () => actions.goToSpace(i + 1),
        })),
      ],
    },
    {
      label: 'Archive',
      submenu: [
        {
          id: 'archived-tabs',
          label: 'Archived Tabs',
          accelerator: 'Alt+CmdOrCtrl+A',
          click: () => actions.command('archived-tabs'),
        },
        {
          id: 'reopen-tab-archive',
          label: 'Reopen Last Archived Tab',
          click: () => actions.command('reopen-tab'),
        },
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        {
          id: 'toggle-pin',
          label: 'Pin / Unpin Tab',
          accelerator: 'CmdOrCtrl+D',
          click: actions.togglePin,
        },
        { type: 'separator' },
        {
          id: 'split-view',
          label: 'New Split View',
          accelerator: 'Ctrl+Shift+=',
          click: () => actions.command('split-view'),
        },
        { id: 'exit-split', label: 'Exit Split View', click: () => actions.command('exit-split') },
        { id: 'swap-split', label: 'Swap Split Panes', click: () => actions.command('swap-split') },
        { type: 'separator' },
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
