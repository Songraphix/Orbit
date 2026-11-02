import { Menu, MenuItem, clipboard } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import type { MenuItemConstructorOptions, WebContents } from 'electron';
import { searchUrl } from '../omnibox/classify';
import { buildContextMenu } from './context-menu-model';
import type { ContextAction } from './context-menu-model';

/** What the page's menu asked Orbit Capture to save (roadmap P2.1). */
export type PageCaptureRequest =
  | { kind: 'page' }
  | { kind: 'selection'; text: string }
  | { kind: 'link'; url: string; text: string }
  | { kind: 'image'; src: string };

/** …or asked the assistant (or Notes) to do with the page or the selection (roadmap P3.1–P3.3). */
export type PageAssistRequest =
  | { kind: 'ask-selection'; text: string }
  | { kind: 'tasks-selection'; text: string }
  | { kind: 'note-selection'; text: string }
  | { kind: 'ask-page' }
  | { kind: 'summarize-page' };

/** …or the Toolkit (roadmap P3.5): an image's details, a screenshot to annotate. */
export type PageToolRequest =
  { kind: 'image-info'; src: string; alt: string } | { kind: 'annotate-page' };

export type PageMenuRequest = PageCaptureRequest | PageAssistRequest | PageToolRequest;

/**
 * Electron shows no right-click menu in web pages; this builds Chrome's essentials (F-31).
 * `openInTab(url, activate)` opens links/images/searches as Orbit tabs.
 */
export function attachContextMenu(
  contents: WebContents,
  openInTab: (url: string, activate: boolean) => void,
  capture?: (request: PageMenuRequest) => void,
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
        case 'capture-page':
          return capture?.({ kind: 'page' });
        case 'capture-selection':
          return capture?.({ kind: 'selection', text: params.selectionText });
        case 'capture-link':
          return capture?.({ kind: 'link', url: params.linkURL, text: params.linkText });
        case 'capture-image':
          return capture?.({ kind: 'image', src: params.srcURL });
        case 'ask-selection':
        case 'tasks-selection':
        case 'note-selection':
          return capture?.({ kind: action, text: params.selectionText });
        case 'ask-page':
        case 'summarize-page':
        case 'annotate-page':
          return capture?.({ kind: action });
        case 'image-info':
          return capture?.({ kind: 'image-info', src: params.srcURL, alt: params.altText });
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
    const menu = Menu.buildFromTemplate(template);
    // Items extensions added with chrome.contextMenus go just above "Inspect".
    const extra = ElectronChromeExtensions.fromSession(contents.session)?.getContextMenuItems(
      contents,
      params,
    );
    if (extra && extra.length > 0) {
      let at = Math.max(0, menu.items.length - 1);
      for (const item of extra) menu.insert(at++, item);
      menu.insert(at, new MenuItem({ type: 'separator' }));
    }
    menu.popup();
  });
}
