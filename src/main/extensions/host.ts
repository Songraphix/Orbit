import { app, dialog, nativeImage } from 'electron';
import type { BaseWindow, Session, WebContents } from 'electron';
import { join } from 'node:path';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import {
  installExtension,
  loadAllExtensions,
  uninstallExtension,
  updateExtensions,
} from 'electron-chrome-web-store';
import type { Rect } from '@shared/types/layout';
import type { ExtensionAction } from '@shared/types/extensions';
import { pickIconPath } from './model';
import type { ManifestIcons } from './model';

/** What the host needs from Orbit's windows (chrome.tabs.* calls from extensions). */
export type ExtensionTabs = {
  /** chrome.tabs.create: a new tab in the focused window. */
  createTab: (url: string | undefined, active: boolean) => [WebContents, BaseWindow] | null;
  /** chrome.tabs.update({ active: true }). */
  selectTab: (contents: WebContents) => void;
  /** chrome.tabs.remove. */
  removeTab: (contents: WebContents) => void;
};

type ActionState = { title?: string; text?: string; color?: string };
/**
 * The library's toolbar-action API. It's internal (its own renderer element talks to it over
 * its own IPC, which would bypass Orbit's typed contract), so Orbit calls it from main
 * instead. Pinned at electron-chrome-extensions 4.9.0; checked at runtime so an upgrade that
 * changes it fails here, loudly, rather than somewhere odd.
 */
type ActionApi = {
  getState(): { actions: (ActionState & { id: string; tabs: Record<string, ActionState> })[] };
  activate(
    event: { type: 'frame'; sender?: WebContents },
    details: {
      eventType: 'click' | 'contextmenu';
      extensionId: string;
      tabId: number;
      anchorRect: Rect;
      alignment?: string;
    },
  ): void;
};

function actionApi(extensions: ElectronChromeExtensions): ActionApi {
  const api = (extensions as unknown as { api?: { browserAction?: Partial<ActionApi> } }).api
    ?.browserAction;
  if (typeof api?.getState !== 'function' || typeof api.activate !== 'function') {
    throw new Error('electron-chrome-extensions: browserAction API not found (version changed?)');
  }
  return api as ActionApi;
}

/**
 * Chrome extensions (Phase 7, ADR-008). Each profile session gets electron-chrome-extensions
 * (chrome.tabs/windows/action… for extensions) and loads the extensions installed under
 * <userData>/Extensions. Installing goes through Orbit (Site controls → Add to Orbit on a Web
 * Store page), never through the Web Store page's own scripts.
 */
export class ExtensionHost {
  private readonly sessions = new Map<Session, ElectronChromeExtensions>();
  readonly path: string;

  constructor(
    private readonly tabs: ExtensionTabs,
    extensionsPath = join(app.getPath('userData'), 'Extensions'),
  ) {
    this.path = extensionsPath;
  }

  /** Call once per profile session, before any tab uses it. */
  async configure(session: Session): Promise<void> {
    if (this.sessions.has(session)) return;
    const extensions = new ElectronChromeExtensions({
      // GPL-3.0: Orbit is a personal, unpublished app (ADR-008).
      license: 'GPL-3.0',
      session,
      createTab: async (details) => {
        const created = this.tabs.createTab(details.url, details.active ?? true);
        if (!created) throw new Error('No window to open the tab in');
        return created as [WebContents, Electron.BrowserWindow];
      },
      selectTab: (contents) => this.tabs.selectTab(contents),
      removeTab: (contents) => this.tabs.removeTab(contents),
    });
    this.sessions.set(session, extensions);
    try {
      await loadAllExtensions(session, this.path);
    } catch (error) {
      console.error('[orbit] loading extensions failed', error);
    }
  }

  /** A tab's page exists (web pages only; internal pages aren't shown to extensions). */
  addTab(contents: WebContents, win: BaseWindow): void {
    this.sessions.get(contents.session)?.addTab(contents, win);
  }

  /** The active tab changed (only tabs added with addTab are known). */
  selectTab(contents: WebContents): void {
    this.sessions.get(contents.session)?.selectTab(contents);
  }

  /** Extension details for its context menu. */
  info(session: Session, extensionId: string): { name: string; optionsUrl: string | null } | null {
    const extension = session.extensions.getExtension(extensionId);
    if (!extension) return null;
    const manifest = extension.manifest as {
      options_page?: string;
      options_ui?: { page?: string };
    };
    const page = manifest.options_page ?? manifest.options_ui?.page;
    return {
      name: extension.name,
      optionsUrl: page ? `${extension.url}${page.replace(/^\//, '')}` : null,
    };
  }

  /** Every extension's toolbar button, as the given tab sees it. */
  actions(contents: WebContents): ExtensionAction[] {
    const extensions = this.sessions.get(contents.session);
    if (!extensions) return [];
    const state = new Map(
      actionApi(extensions)
        .getState()
        .actions.map((a) => [a.id, a]),
    );
    return contents.session.extensions.getAllExtensions().map((extension) => {
      const action = state.get(extension.id);
      const perTab = action?.tabs[String(contents.id)] ?? {};
      const manifest = extension.manifest as ManifestIcons & { name?: string };
      const iconPath = pickIconPath(manifest, 32);
      const image = iconPath ? nativeImage.createFromPath(join(extension.path, iconPath)) : null;
      return {
        id: extension.id,
        name: extension.name,
        icon: image && !image.isEmpty() ? image.resize({ width: 32 }).toDataURL() : null,
        title: perTab.title ?? action?.title ?? extension.name,
        badgeText: perTab.text ?? action?.text ?? '',
        badgeColor: perTab.color ?? action?.color ?? null,
      };
    });
  }

  /** Clicking an extension's button: its popup (anchored at `anchor`) or its click handler. */
  activate(contents: WebContents, extensionId: string, anchor: Rect, menu = false): void {
    const extensions = this.sessions.get(contents.session);
    if (!extensions || !contents.session.extensions.getExtension(extensionId)) return;
    actionApi(extensions).activate(
      { type: 'frame' },
      {
        eventType: menu ? 'contextmenu' : 'click',
        extensionId,
        tabId: contents.id,
        anchorRect: anchor,
        alignment: 'bottom left',
      },
    );
  }

  /** The page's context menu items added by extensions (chrome.contextMenus). */
  contextMenuItems(contents: WebContents, params: Electron.ContextMenuParams): Electron.MenuItem[] {
    return this.sessions.get(contents.session)?.getContextMenuItems(contents, params) ?? [];
  }

  isInstalled(session: Session, extensionId: string): boolean {
    return session.extensions.getExtension(extensionId) !== null;
  }

  /** Downloads from the Chrome Web Store (asks first) and loads into every profile. */
  async install(extensionId: string, parent: Electron.BrowserWindow): Promise<string | null> {
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      message: 'Add this extension to Orbit?',
      detail:
        'It will be downloaded from the Chrome Web Store and can read and change the sites it ' +
        'asks for, in every space.',
      buttons: ['Add Extension', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return null;
    let name: string | null = null;
    for (const session of this.sessions.keys()) {
      const extension = await installExtension(extensionId, { session, extensionsPath: this.path });
      name = extension.name;
    }
    return name;
  }

  async uninstall(extensionId: string): Promise<void> {
    for (const session of this.sessions.keys()) {
      await uninstallExtension(extensionId, { session, extensionsPath: this.path });
    }
  }

  /** Background update check for every profile. */
  async update(): Promise<void> {
    for (const session of this.sessions.keys()) {
      await updateExtensions(session).catch((error: unknown) => {
        console.error('[orbit] extension update failed', error);
      });
    }
  }
}
