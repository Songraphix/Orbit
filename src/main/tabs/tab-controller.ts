import { WebContentsView } from 'electron';
import type { Session } from 'electron';
import type { TabState } from '@shared/types/tabs';
import { fetchFaviconDataUrl } from './favicon';
import { attachContextMenu } from './context-menu';
import type { PageMenuRequest } from './context-menu';
import { guardWebContents } from './web-guards';
import { MEDIA_SESSION_SHIM } from '../media/session-bridge';
import { ERR_ABORTED } from '@shared/load-error';

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
  /** Browsing history sink (visits, titles, favicons). */
  history: HistorySink;
  /** Saved zoom level for a page's site (applied on every navigation). */
  zoomFor(url: string): number;
  /** Where a navigation should go instead (a site blocked during focus), or null. */
  redirectFor?(url: string): string | null;
  /** The page stopped responding (the window offers Wait / Reload). */
  onUnresponsive?(): void;
  /** Audio/video started or stopped (the sidebar mini player). */
  onMedia?(event: 'playing' | 'paused'): void;
  /** Find-in-page results from Chromium. */
  onFoundInPage(result: { requestId: number; activeMatchOrdinal: number; matches: number }): void;
  /** The page took keyboard focus (e.g. clicked in split view). */
  onFocus?(): void;
  /** "Save … to Orbit" from the page's right-click menu (roadmap P2.1). */
  onCapture?(request: PageMenuRequest): void;
};

export type HistorySink = {
  recordVisit(url: string, title: string): void;
  updateTitle(url: string, title: string): void;
  setFavicon(url: string, dataUrl: string): void;
};

const isInternalUrl = (url: string) => url.startsWith('orbit://');

/**
 * One tab and its WebContentsView (PLAN.md section 4.7). Web tabs get no preload at all;
 * internal tabs (the new tab page) get the reduced internal preload and can't navigate.
 */
export type TabOptions = {
  /** Profile session (Phase 3); defaults to the default session. */
  session?: Session;
  /** Restored tabs: show saved title/favicon, but don't load the page until first activated. */
  deferLoad?: boolean;
  title?: string;
  favicon?: string | null;
};

export class TabController {
  view: WebContentsView;
  private stateValue: TabState;
  private faviconRequest = 0;
  private pendingLoad: boolean;
  private readonly session?: Session;

  constructor(
    readonly id: string,
    url: string,
    private env: TabEnv,
    options: TabOptions = {},
  ) {
    const kind = isInternalUrl(url) ? 'internal' : 'web';
    this.session = options.session;
    this.stateValue = {
      id,
      url,
      title: options.title || (kind === 'internal' ? 'New Tab' : url),
      favicon: options.favicon ?? null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      kind,
      crashed: false,
      loadError: null,
      devMode: false,
      consoleErrors: 0,
      viewport: null,
    };
    this.view = this.createView(kind);
    this.pendingLoad = options.deferLoad ?? false;
    if (!this.pendingLoad) this.loadIntoView(url);
  }

  get state(): TabState {
    return this.stateValue;
  }

  /** Hands the tab to a new owner (a Peek page promoted to a tab keeps its page). */
  setEnv(env: TabEnv): void {
    this.env = env;
  }

  /** True while a restored tab hasn't loaded its page yet. */
  get isPending(): boolean {
    return this.pendingLoad;
  }

  /** Loads a deferred (restored) tab's page; called when the tab is first shown. */
  ensureLoaded(): void {
    if (!this.pendingLoad) return;
    this.pendingLoad = false;
    this.loadIntoView(this.stateValue.url);
  }

  /** Navigates this tab. Switching between internal and web pages swaps the view entirely, so a
   *  website never inherits the internal page's privileged preload. */
  load(url: string): void {
    this.pendingLoad = false;
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
      crashed: false,
      loadError: null,
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
    if (this.stateValue.crashed) {
      this.update({ crashed: false });
      contents.reload();
    } else if (this.stateValue.loadError) {
      // Try the address that failed again (what the window shows may be an empty error page).
      const { url } = this.stateValue.loadError;
      this.update({ loadError: null });
      void contents.loadURL(url).catch(() => undefined);
    } else if (this.stateValue.kind === 'internal') {
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
    const redirect = this.stateValue.kind === 'web' ? this.env.redirectFor?.(url) : null;
    if (redirect) {
      this.load(redirect);
      return;
    }
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
    contents.on('focus', () => this.env.onFocus?.());

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
    attachContextMenu(
      contents,
      (url, activate) => this.env.openInNewTab(url, activate),
      (request) => this.env.onCapture?.(request),
    );
    contents.on('enter-html-full-screen', () => this.env.onHtmlFullscreen(true));
    contents.on('leave-html-full-screen', () => this.env.onHtmlFullscreen(false));

    contents.on('did-start-loading', () =>
      this.update({ isLoading: true, crashed: false, loadError: null }),
    );
    // A page that can't load (offline, unknown address…) gets a card, not a blank page.
    contents.on('did-fail-load', (_e, code, _description, url, isMainFrame) => {
      if (!isMainFrame || code === ERR_ABORTED) return;
      this.update({ loadError: { code, url }, url, isLoading: false });
    });
    // Focus mode's blocked sites: links, redirects and typed addresses alike.
    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      const redirect = this.env.redirectFor?.(details.url);
      if (!redirect) return;
      contents.stop();
      setImmediate(() => this.load(redirect));
    });
    // Crash recovery (F-31): show a Reload card rather than a dead page.
    contents.on('render-process-gone', (_e, details) => {
      if (details.reason !== 'clean-exit') this.update({ crashed: true, isLoading: false });
    });
    contents.on('unresponsive', () => this.env.onUnresponsive?.());
    // The mini player's previous / next track use the site's own media session handlers: the
    // shim goes in as early as it can (once at commit, again when the page is parsed).
    const shim = () => void contents.executeJavaScript(MEDIA_SESSION_SHIM).catch(() => undefined);
    contents.on('did-navigate', shim);
    contents.on('dom-ready', shim);
    contents.on('media-started-playing', () => this.env.onMedia?.('playing'));
    contents.on('media-paused', () => this.env.onMedia?.('paused'));
    contents.on('did-stop-loading', () => this.update({ isLoading: false, ...this.navState() }));
    contents.on('did-navigate', () => {
      const url = contents.getURL();
      this.update({ url, favicon: null, consoleErrors: 0, ...this.navState() });
      this.env.history.recordVisit(url, contents.getTitle());
      contents.setZoomLevel(this.env.zoomFor(url)); // per-site zoom survives restarts
    });
    contents.on('found-in-page', (_e, result) => this.env.onFoundInPage(result));
    contents.on('console-message', (details) => {
      if (details.level === 'error') {
        this.update({ consoleErrors: this.stateValue.consoleErrors + 1 });
      }
    });
    contents.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) this.update({ url: contents.getURL(), ...this.navState() });
    });
    contents.on('page-title-updated', (_e, title) => {
      this.update({ title });
      this.env.history.updateTitle(contents.getURL(), title);
    });
    contents.on('page-favicon-updated', (_e, favicons) => {
      const request = ++this.faviconRequest;
      void fetchFaviconDataUrl(contents.session, favicons).then((favicon) => {
        if (request !== this.faviconRequest || contents.isDestroyed()) return;
        this.update({ favicon });
        if (favicon) this.env.history.setFavicon(contents.getURL(), favicon);
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
