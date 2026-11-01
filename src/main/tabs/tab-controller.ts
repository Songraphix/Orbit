import { WebContentsView } from 'electron';
import type { Session } from 'electron';
import type { TabState } from '@shared/types/tabs';
import { fetchFaviconDataUrl } from './favicon';
import { attachContextMenu } from './context-menu';
import { guardWebContents } from './web-guards';

/** What a tab needs from the outside world. Keeps TabController free of window/manager details. */
export type TabEnv = {
  /** Preload for internal orbit:// pages (never attached to web content). */
  internalPreload: string;
  /** Loads the internal page for an orbit:// URL into a view. */
  loadInternal(view: WebContentsView, url: string): void;
  /** Marks a webContents as a trusted internal surface for IPC, or removes it. */
  registerInternal(webContentsId: number): void;
  unregisterInternal(webContentsId: number): void;
  /** A page asked to open a link in a new tab (⌘-click → in the background). */
  openInNewTab(url: string, activate: boolean): void;
  /** Called whenever this tab's state (title, url, loading…) changes. */
  onChange(): void;
  /** Called when the tab swaps its view (e.g. new tab page → website). */
  onViewReplaced(oldView: WebContentsView, newView: WebContentsView): void;
  /** The page entered or left HTML fullscreen (e.g. YouTube's fullscreen button). */
  onHtmlFullscreen(enter: boolean): void;
};

const isInternalUrl = (url: string) => url.startsWith('orbit://');

/**
 * One tab and its WebContentsView (PLAN.md section 4.7). Web tabs get no preload at all;
 * internal tabs (the new tab page) get the reduced internal preload and can't navigate.
 */
export class TabController {
  view: WebContentsView;
  private stateValue: TabState;
  private faviconRequest = 0;

  constructor(
    readonly id: string,
    url: string,
    private readonly env: TabEnv,
    private readonly session?: Session,
  ) {
    const kind = isInternalUrl(url) ? 'internal' : 'web';
    this.stateValue = {
      id,
      url,
      title: kind === 'internal' ? 'New Tab' : url,
      favicon: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      kind,
    };
    this.view = this.createView(kind);
    this.loadIntoView(url);
  }

  get state(): TabState {
    return this.stateValue;
  }

  /** Navigates this tab. Switching between internal and web pages swaps the view entirely, so a
   *  website never inherits the internal page's privileged preload. */
  load(url: string): void {
    const kind = isInternalUrl(url) ? 'internal' : 'web';
    if (kind !== this.stateValue.kind) {
      const oldView = this.view;
      this.view = this.createView(kind);
      this.env.onViewReplaced(oldView, this.view);
      this.destroyView(oldView);
    }
    this.update({
      kind,
      url,
      title: kind === 'internal' ? 'New Tab' : url,
      favicon: null,
      canGoBack: false,
      canGoForward: false,
    });
    this.loadIntoView(url);
  }

  goBack(): void {
    const history = this.view.webContents.navigationHistory;
    if (this.stateValue.kind === 'web' && history.canGoBack()) history.goBack();
  }

  goForward(): void {
    const history = this.view.webContents.navigationHistory;
    if (this.stateValue.kind === 'web' && history.canGoForward()) history.goForward();
  }

  /** Reloads (or stops, if loading). `hard` bypasses the cache (⇧⌘R). */
  reload(hard = false): void {
    const contents = this.view.webContents;
    if (this.stateValue.kind === 'internal') {
      this.env.loadInternal(this.view, this.stateValue.url);
    } else if (hard) {
      contents.reloadIgnoringCache();
    } else {
      contents.reload();
    }
  }

  stop(): void {
    this.view.webContents.stop();
  }

  destroy(): void {
    this.destroyView(this.view);
  }

  private update(patch: Partial<TabState>): void {
    this.stateValue = { ...this.stateValue, ...patch };
    this.env.onChange();
  }

  private loadIntoView(url: string): void {
    if (this.stateValue.kind === 'internal') this.env.loadInternal(this.view, url);
    else
      void this.view.webContents.loadURL(url).catch(() => {
        // Load failures (offline, DNS…) surface through did-fail-load; error pages come in Phase 3.
      });
  }

  private createView(kind: TabState['kind']): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        ...(kind === 'internal' ? { preload: this.env.internalPreload } : {}),
        ...(this.session ? { session: this.session } : {}),
      },
    });
    view.setBackgroundColor('#ffffff');
    const contents = view.webContents;

    if (kind === 'internal') {
      const id = contents.id;
      this.env.registerInternal(id);
      contents.once('destroyed', () => this.env.unregisterInternal(id));
      // Internal pages never navigate or open windows themselves; they ask main via IPC.
      contents.on('will-navigate', (event) => event.preventDefault());
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('page-title-updated', (_e, title) => this.update({ title }));
      return view;
    }

    // Scheme rules, links → tabs, real popups (sign-in) → sandboxed popup windows.
    guardWebContents(contents, (url, activate) => this.env.openInNewTab(url, activate));
    attachContextMenu(contents, (url, activate) => this.env.openInNewTab(url, activate));
    contents.on('enter-html-full-screen', () => this.env.onHtmlFullscreen(true));
    contents.on('leave-html-full-screen', () => this.env.onHtmlFullscreen(false));

    contents.on('did-start-loading', () => this.update({ isLoading: true }));
    contents.on('did-stop-loading', () => this.update({ isLoading: false, ...this.navState() }));
    contents.on('did-navigate', () =>
      this.update({ url: contents.getURL(), favicon: null, ...this.navState() }),
    );
    contents.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) this.update({ url: contents.getURL(), ...this.navState() });
    });
    contents.on('page-title-updated', (_e, title) => this.update({ title }));
    contents.on('page-favicon-updated', (_e, favicons) => {
      const request = ++this.faviconRequest;
      void fetchFaviconDataUrl(contents.session, favicons).then((favicon) => {
        if (request === this.faviconRequest && !contents.isDestroyed()) this.update({ favicon });
      });
    });
    return view;
  }

  private navState(): Pick<TabState, 'canGoBack' | 'canGoForward'> {
    const history = this.view.webContents.navigationHistory;
    return { canGoBack: history.canGoBack(), canGoForward: history.canGoForward() };
  }

  private destroyView(view: WebContentsView): void {
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
