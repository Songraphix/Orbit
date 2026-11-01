import { clipboard, Menu } from 'electron';
import type { MenuItemConstructorOptions, WebContents } from 'electron';
import { searchUrl } from '../omnibox/classify';
import { buildContextMenu } from './context-menu-model';
import type { ContextAction } from './context-menu-model';

/**
 * Electron shows no right-click menu in web pages; this builds Chrome's essentials (F-31).
 * `openInTab(url, activate)` opens links/images/searches as Orbit tabs.
 */
export function attachContextMenu(
  contents: WebContents,
  openInTab: (url: string, activate: boolean) => void,
): void {
  contents.on('context-menu', (_event, params) => {
    const history = contents.navigationHistory;
    const items = buildContextMenu(params, {
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
    });

    const run = (action: ContextAction) => {
      if (action.startsWith('spell:')) {
        contents.replaceMisspelling(action.slice('spell:'.length));
        return;
      }
      switch (action) {
        case 'back':
          return history.goBack();
        case 'forward':
          return history.goForward();
        case 'reload':
          return contents.reload();
        case 'open-link':
          return openInTab(params.linkURL, false); // like Chrome: opens in the background
        case 'copy-link':
          return clipboard.writeText(params.linkURL);
        case 'open-image':
          return openInTab(params.srcURL, false);
        case 'copy-image':
          return contents.copyImageAt(params.x, params.y);
        case 'copy-image-url':
          return clipboard.writeText(params.srcURL);
        case 'save-image':
          return contents.downloadURL(params.srcURL);
        case 'undo':
          return contents.undo();
        case 'redo':
          return contents.redo();
        case 'cut':
          return contents.cut();
        case 'copy':
          return contents.copy();
        case 'paste':
          return contents.paste();
        case 'select-all':
          return contents.selectAll();
        case 'search-selection':
          return openInTab(searchUrl(params.selectionText.trim()), true);
        case 'add-to-dictionary':
          return contents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
        case 'inspect':
          contents.inspectElement(params.x, params.y);
          if (contents.isDevToolsOpened()) contents.devToolsWebContents?.focus();
          return;
      }
    };

    const template: MenuItemConstructorOptions[] = items.map((entry) =>
      entry.type === 'separator'
        ? { type: 'separator' }
        : { label: entry.label, enabled: entry.enabled, click: () => run(entry.action) },
    );
    Menu.buildFromTemplate(template).popup();
  });
}
