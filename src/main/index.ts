import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  net,
  powerMonitor,
  protocol,
  Notification,
  safeStorage,
  session,
  shell,
  systemPreferences,
  webContents,
} from 'electron';
import type { Session } from 'electron';
import type { WebContentsView } from 'electron';
import { APP_NAME, isInternalPage } from '@shared/constants';
import { DEFAULT_PROFILE_ID } from '@shared/types/space';
import type { RendererEntry } from '@shared/constants';
import { chromeUserAgent } from './app/user-agent';
import { Broadcaster } from './ipc/broadcaster';
import { CommandBarService, copyActiveUrl } from './commandbar/service';
import { registerAppHandlers } from './ipc/handlers/app';
import { ExtensionHost } from './extensions/host';
import { AccountService } from './cloud/account';
import { cloudConfig } from './cloud/config';
import type { CloudEnv } from './cloud/config';
import { googleSignIn } from './cloud/google-signin';
import type { Fetch } from './cloud/http';
import { registerAccountHandlers } from './ipc/handlers/account';
import { registerSiteControlsHandlers } from './ipc/handlers/site-controls';
import { openBoostEditor, registerBoostHandlers } from './ipc/handlers/boosts';
import { BoostService } from './boosts/service';
import { domainForPage } from './boosts/model';
import { boostIdSchema } from '@shared/types/boosts';
import { librarySectionSchema } from '@shared/types/library';
import { easelIdSchema } from '@shared/types/easels';
import { easelUrl, newEasel, registerEaselHandlers } from './ipc/handlers/easels';
import { ToolkitService } from './toolkit/service';
import { attachJsonViewer } from './toolkit/json-viewer';
import { registerToolkitHandlers } from './ipc/handlers/toolkit';
import { GithubService, cleanGithubToken } from './github/service';
import { applyPendingRestore, BackupService } from './backup/service';
import { registerBackupHandlers } from './ipc/handlers/backup';
import { VIEWPORT_PRESETS } from '@shared/toolkit/state';
import type { EaselCapture } from '@shared/types/easels';
import { CaptureRequests } from './easels/capture-requests';
import { registerLibraryHandlers } from './ipc/handlers/library';
import { MediaLibrary } from './library/media';
import { LiveFolderService } from './live-folders/service';
import { AiKeyStore, cleanApiKey } from './ai/key-store';
import type { Cipher } from './ai/key-store';
import { AIService, TIDY_MODEL } from './ai/service';
import { AssistantService } from './ai/assistant';
import { registerAssistantHandlers } from './ipc/handlers/assistant';
import { appendMarkdown, noteFromMarkdown } from './notes/from-markdown';
import type { PageMenuRequest } from './tabs/context-menu';
import { TidyService } from './ai/tidy';
import { feedInputUrl, githubRepo } from './live-folders/model';
import type { LiveSource } from '@shared/types/live-folders';
import { registerCommandBarHandlers } from './ipc/handlers/command-bar';
import { registerFindHandlers } from './ipc/handlers/find';
import { registerInternalPageHandlers } from './ipc/handlers/internal-pages';
import { registerSidebarHandlers } from './ipc/handlers/sidebar';
import { registerLayoutHandlers } from './ipc/handlers/layout';
import { registerNewTabHandlers } from './ipc/handlers/newtab';
import { navigateTab, registerTabHandlers } from './ipc/handlers/tabs';
import { WallpaperService } from './newtab/wallpaper-service';
import { CanvasService } from './theme/canvas-service';
import { readThumbnail } from './theme/thumbnail';
import { installAppMenu } from './menus/app-menu';
import { IpcRouter } from './ipc/router';
import { SenderRegistry } from './ipc/sender';
import { openPersistence } from './persistence';
import { backupDatabase } from './persistence/backup';
import { clampZoom } from './persistence/repositories/site-settings';
import type { Persistence } from './persistence';
import { SidebarStore } from './sidebar/store';
import { TabLifecycle } from './archive/lifecycle';
import { DownloadService } from './downloads/service';
import { classifyInput, setSearchEngine } from './omnibox/classify';
import { SEARCH_ENGINES } from '@shared/settings';
import { PermissionService } from './permissions/service';
import { ArcImporter, findArcSources } from './importer/arc/import';
import { WindowManager } from './windows/window-manager';
import { acceptExternalUrl, LittleWindow } from './windows/little';
import { routeLink } from '@shared/rules';
import type { WindowController } from './windows/window-manager';
import { notesHash } from './notes/model';
import { enableQuietMode } from './app/quiet';
import { registerProfileHandlers } from './ipc/handlers/profiles';
import { registerWorkHandlers } from './ipc/handlers/work';
import { registerCaptureHandlers } from './ipc/handlers/capture';
import { registerTooltipHandlers } from './ipc/handlers/tooltip';
import { registerFocusHandlers } from './ipc/handlers/focus';
import { FocusService } from './focus/service';
import { WeatherService } from './newtab/weather';
import { registerAppHubHandlers } from './ipc/handlers/apps';
import { browserToolDeps } from './ai/browser-deps';
import { VoiceService } from './voice/service';
import type { HostCommand } from './voice/service';
import { DriveService } from './drive/service';
import { LocalPdfs, PDF_SCHEME } from './pdf/local-files';
import { driveKind, editedLabel } from '@shared/drive';
import { registerDriveHandlers } from './ipc/handlers/drive';
import {
  downloadVoiceModel,
  readModelFile,
  removeVoiceModel,
  voiceModelReady,
} from './voice/model-files';
import { registerVoiceHandlers } from './ipc/handlers/voice';
import { openFavorite } from './apps/open';
import { appLibraryView } from './apps/library';
import type { AssistantState } from '@shared/assistant';
import { UnsplashService } from './newtab/unsplash';
import { SoundService } from './focus/sounds';
import { soundIdSchema } from '@shared/sounds';
import type { FocusView } from '@shared/focus';
import { CaptureService } from './capture/service';
import { saveSpaceAsTemplate, spaceFromTemplate } from './sidebar/templates';
import { captureLabel, captureMatches, hostOf } from '@shared/capture';
import { FloatingNotes } from './notes/floating';
import { newNoteTab, noteUrl, registerNotesHandlers, toggleQuickNote } from './ipc/handlers/notes';
import { noteIdSchema } from '@shared/types/notes';

app.setName(APP_NAME);

// Sites see a plain Chrome, not "Electron" (Google sign-in rejects embedded browsers; §4.9 #1).
app.userAgentFallback = chromeUserAgent(process.versions.chrome ?? '0');

// Tests (and side-by-side dev instances) use their own profile so they never touch real data.
// Must run before the single-instance lock, which is keyed on the userData path.
const userDataOverride = process.env['ORBIT_USER_DATA_DIR'];
if (userDataOverride) app.setPath('userData', userDataOverride);

// One Orbit at a time; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Automated test runs: windows open without stealing focus (see quiet.ts). Before launch
// finishes, so the app is never activated at all.
if (!app.isPackaged && process.env['ORBIT_QUIET'] === '1') enableQuietMode();

const devServer = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererDir = join(import.meta.dirname, '../renderer');

// Only Orbit's own pages may talk to main: the dev server in development, the bundled files otherwise.
const senders = new SenderRegistry(
  devServer ? [`${new URL(devServer).origin}/`] : [pathToFileURL(`${rendererDir}/`).href],
);
const broadcaster = new Broadcaster();

let persistence: Persistence | null = null;
let sidebarStore: SidebarStore | null = null;
let lifecycle: TabLifecycle | null = null;
let downloadService: DownloadService | null = null;
let arcImporter: ArcImporter | null = null;
let boostService: BoostService | null = null;
let liveFolders: LiveFolderService | null = null;
/** Tidy for a window's space, with its toast (the space header, the sidebar's menu). */
let runTidy: ((controller: WindowController) => Promise<void>) | null = null;

// A stray error in main must never show Electron's blocking error dialog (a browser that can't
// quit is worse than one that logs). Logged for debugging instead.
process.on('uncaughtException', (error) => console.error('[orbit] uncaught exception', error));
process.on('unhandledRejection', (reason) => console.error('[orbit] unhandled rejection', reason));
let windows: WindowManager | null = null;
let canvasService: CanvasService | null = null;
let floatingNotes: FloatingNotes | null = null;
let captureService: CaptureService | null = null;
// PDFs from this Mac open at orbit-pdf:// addresses (Chromium's PDF viewer shows them).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'orbit-pdf',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// Tests only: Chromium's fake microphone plays a recording (voice e2e), and nothing asks.
if (process.env['ORBIT_TEST_FAKE_MIC']) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch(
    'use-file-for-fake-audio-capture',
    `${process.env['ORBIT_TEST_FAKE_MIC']}%noloop`,
  );
  // The audio service's own (sandboxed) process can't read the recording; keep it in-process.
  app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
}

let focusService: FocusService | null = null;
let soundService: SoundService | null = null;

/** The panel's Focus view (or closes the panel if that's what it shows). */
function openFocusView(controller: WindowController): void {
  controller.notes.openAt('panel/focus');
}
let assistantService: AssistantService | null = null;
let voiceService: VoiceService | null = null;
let voiceToggle: ((target: 'bar' | 'popup' | 'panel', senderId: number) => Promise<void>) | null =
  null;
let driveService: DriveService | null = null;
/** Orbit AI's service, for pages that only ask whether it can answer. */
let aiServiceRef: AIService | null = null;
/** The voice popup follows Orbit AI's answers (set once voice is wired up). */
let assistantAnswerHook: ((controller: WindowController, state: AssistantState) => void) | null =
  null;
let openGrouping: ((controller: WindowController) => void) | null = null;
let toolkitService: ToolkitService | null = null;

function loadRenderer(win: BrowserWindow, entry: RendererEntry, query?: string): void {
  if (devServer) void win.loadURL(`${devServer}/${entry}/index.html${query ? `?${query}` : ''}`);
  else void win.loadFile(join(rendererDir, entry, 'index.html'), query ? { search: query } : {});
}

// ── Links from other apps (default browser) → Little Orbit (F-24) ────────────
const littleWindows = new Map<number, LittleWindow>();
const pendingUrls: string[] = [];
let openLittle: ((url: string | null) => void) | null = null;
/** A link from another app: your rules first (roadmap P4.4), else Little Orbit (F-24). */
let openExternal: ((url: string) => void) | null = null;
/** ⌥⌘N, from any app (F-24). */
const LITTLE_SHORTCUT = 'Alt+CommandOrControl+N';
let lastEmptyLittle = 0;
/** Tabs on top (the strip) or in the sidebar, in every window. */
function applyTabLayout(layout: 'sidebar' | 'top'): void {
  for (const controller of windows?.all() ?? []) controller.layout.setTopTabs(layout === 'top');
}

/** Settings → Appearance: every window, Orbit page and web page follows it (prefers-color-scheme),
 *  and so do macOS's own materials and menus. */
function applyAppearance(appearance: 'system' | 'light' | 'dark'): void {
  nativeTheme.themeSource = appearance;
}

/** Light ↔ dark (from whatever shows now), kept as the Appearance setting. */
function toggleAppearance(): 'light' | 'dark' {
  const next = nativeTheme.shouldUseDarkColors ? 'light' : 'dark';
  persistence?.settings.set('appearance', next);
  applyAppearance(next);
  return next;
}

/** The menu accelerator and the global shortcut can both fire for one press; open one window. */
function openEmptyLittle(): void {
  if (Date.now() - lastEmptyLittle < 400) return;
  lastEmptyLittle = Date.now();
  openLittle?.(null);
}
function applyLittleShortcut(enabled: boolean): void {
  if (globalShortcut.isRegistered(LITTLE_SHORTCUT)) globalShortcut.unregister(LITTLE_SHORTCUT);
  // Fails quietly if another app owns the shortcut; the menu item still works inside Orbit.
  if (enabled) globalShortcut.register(LITTLE_SHORTCUT, openEmptyLittle);
}

/** PDFs from Finder or the Dock (Open With → Orbit, dropping on the icon). */
const pendingPdfs: string[] = [];
let openPdfFile: ((path: string) => void) | null = null;

app.on('will-finish-launching', () => {
  app.on('open-file', (event, path) => {
    if (!/\.pdf$/i.test(path)) return;
    event.preventDefault();
    if (openPdfFile) openPdfFile(path);
    else pendingPdfs.push(path);
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!acceptExternalUrl(url)) return;
    if (openExternal) openExternal(url);
    else pendingUrls.push(url); // arrived before Orbit finished starting
  });
});

/** orbit://<page> → the internal renderer with `#/<page>` (`#/boost/<id>` for a Boost's editor).
 *  Unknown pages show "not found". */
function loadInternal(view: { webContents: Electron.WebContents }, url: string): void {
  const { hostname: page, pathname } = new URL(url);
  const param = pathname.slice(1);
  let hash = `/${isInternalPage(page) ? page : 'not-found'}`;
  // Pages with a parameter: a Boost's editor, a Library section.
  if (page === 'boost')
    hash = boostIdSchema.safeParse(param).success ? `/boost/${param}` : '/not-found';
  if (page === 'easel')
    hash = easelIdSchema.safeParse(param).success ? `/easel/${param}` : '/not-found';
  if (page === 'library')
    hash = librarySectionSchema.safeParse(param).success ? `/library/${param}` : '/not-found';
  // Settings can open on a section (orbit://settings/profiles).
  if (
    page === 'settings' &&
    /^(account|general|appearance|apps|profiles|workspaces|integrations|rules|backup|shortcuts|ai|voice|privacy|about)$/.test(
      param,
    )
  )
    hash = `/settings/${param}`;
  // A note's tab (note/<id>), the Notes panel (notes/panel[/<id>]), a floating note (notes/float/<id>).
  if (page === 'note')
    hash = noteIdSchema.safeParse(param).success ? `/note/${param}` : '/not-found';
  if (page === 'notes') hash = notesHash(param);
  // A site blocked during focus: its address rides along (the page offers to open it anyway).
  if (page === 'blocked') hash = /^https?%3A/i.test(param) ? `/blocked/${param}` : '/not-found';
  if (devServer) void view.webContents.loadURL(`${devServer}/internal/index.html#${hash}`);
  else void view.webContents.loadFile(join(rendererDir, 'internal', 'index.html'), { hash });
}

function loadOverlay(view: WebContentsView): void {
  if (devServer) void view.webContents.loadURL(`${devServer}/overlay/index.html`);
  else void view.webContents.loadFile(join(rendererDir, 'overlay', 'index.html'));
}

/** A short confirmation shown in the toolbar (⇧⌘C "Copied link", zoom level…). */
function toast(controller: WindowController, message: string): void {
  broadcaster.sendTo(controller.win.webContents, 'toast:show', { message, at: Date.now() });
}

/** ⌘+ / ⌘− / ⌘0 on the active page; remembered per site. */
function zoom(controller: WindowController, action: 'in' | 'out' | 'reset'): void {
  const tab = controller.tabs.active;
  if (!tab || tab.state.kind !== 'web' || !persistence) return;
  const contents = tab.view.webContents;
  const current = contents.getZoomLevel();
  const level = clampZoom(action === 'reset' ? 0 : current + (action === 'in' ? 0.5 : -0.5));
  contents.setZoomLevel(level);
  persistence.siteSettings.setZoom(tab.state.url, level);
  toast(controller, `Zoom ${Math.round(Math.pow(1.2, level) * 100)}%`);
}

/**
 * File → Import from Arc… (F-27): finds the backup, previews it, imports on confirmation, and
 * switches to the first imported space.
 */
async function importFromArc(controller: WindowController): Promise<void> {
  if (!arcImporter) return;
  const override = process.env['ORBIT_ARC_DIR'];
  let source = override ?? findArcSources()[0];
  if (!source) {
    const picked = await dialog.showOpenDialog(controller.win, {
      title: 'Choose your Arc backup folder',
      message: 'Choose the folder that contains StorableSidebar.json',
      properties: ['openDirectory'],
    });
    source = picked.filePaths[0];
    if (picked.canceled || !source) return;
  }
  let preview;
  try {
    preview = arcImporter.preview(source);
  } catch (error) {
    await dialog.showMessageBox(controller.win, {
      type: 'error',
      message: 'This folder can’t be imported',
      detail: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const { response } = await dialog.showMessageBox(controller.win, {
    type: 'question',
    message: 'Import from Arc?',
    detail:
      `From ${source}\n\n` +
      `${preview.spaces} spaces (${preview.spaceNames.join(', ')})\n` +
      `${preview.favorites} favorites · ${preview.pinned} pinned tabs · ${preview.today} Today tabs\n` +
      `${preview.history.toLocaleString()} history entries\n\n` +
      'Running it again later won’t create duplicates. Passwords and cookies aren’t imported — ' +
      'sign in once per site.',
    buttons: ['Import', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  const result = arcImporter.import(source);
  const firstArcSpace = sidebarStore?.spaces.find((s) => s.id.startsWith('arc-'));
  if (firstArcSpace) controller.tabs.switchSpace(firstArcSpace.id);
  toast(
    controller,
    result.spacesAdded > 0
      ? `Imported ${result.spacesAdded} spaces, ${result.favoritesAdded} favorites, ${result.tabsAdded} tabs`
      : 'Already imported — nothing new',
  );
}

const LIVE_PROMPTS = {
  rss: {
    title: 'Add an RSS Feed',
    message: 'A feed address, or a site that has one. New posts appear in a folder.',
    placeholder: 'example.com/blog',
  },
  pulls: {
    title: 'Add GitHub Pull Requests',
    message: 'Open pull requests of a repository, kept up to date in a folder.',
    placeholder: 'owner/repository',
  },
  issues: {
    title: 'Add GitHub Issues',
    message: 'Open issues of a repository, kept up to date in a folder.',
    placeholder: 'owner/repository',
  },
} as const;

/** Space menu → Live Folders › Add… (F-28): ask for the source, check it, add the folder. */
async function addLiveFolder(
  controller: WindowController,
  kind: 'rss' | 'pulls' | 'issues',
  spaceId: string,
): Promise<void> {
  const space = sidebarStore?.space(spaceId);
  if (!liveFolders || !space) return;
  const answer = await controller.overlay.ask({
    kind: 'input',
    ...LIVE_PROMPTS[kind],
    confirm: 'Add',
  });
  if (!answer.allow || !answer.value) return;
  let source: LiveSource | null;
  if (kind === 'rss') {
    const url = feedInputUrl(answer.value);
    source = url ? { type: 'rss', url } : null;
  } else {
    const repo = githubRepo(answer.value);
    source = repo ? { type: 'github', repo, what: kind } : null;
  }
  if (!source) {
    toast(controller, kind === 'rss' ? 'That isn’t a web address' : 'Use owner/repository');
    return;
  }
  try {
    const folder = await liveFolders.create(source, space);
    toast(controller, `Added ${folder.title}`);
  } catch (error) {
    toast(controller, `Couldn’t add it: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A page's right-click menu asked Orbit to do something with the page or the selection: save
 *  it (Capture), ask the assistant, make tasks, or start a note. */
function pageMenuRequest(
  controller: WindowController,
  tabId: string,
  request: PageMenuRequest,
): void {
  const tab = controller.tabs.get(tabId);
  const page = { url: tab?.state.url ?? '', title: tab?.state.title ?? '' };
  switch (request.kind) {
    case 'ask-selection':
      assistantService?.open(controller, { selection: { text: request.text, ...page } });
      return;
    // Brief M6: the selection goes to Claude with the question (the menu says Orbit AI).
    case 'explain-selection':
      assistantService?.open(controller, {
        selection: { text: request.text, ...page },
        prompt: 'Explain this selection in plain words: what it says and what it means here.',
      });
      return;
    case 'translate-selection': {
      const language =
        new Intl.DisplayNames(['en'], { type: 'language' }).of(app.getLocale().split('-')[0]!) ??
        'English';
      assistantService?.open(controller, {
        selection: { text: request.text, ...page },
        prompt: `Translate this selection into ${language}. If it is already in ${language}, translate it into English. Give only the translation, then a one-line note on anything that doesn't translate cleanly.`,
      });
      return;
    }
    case 'split-page':
      if (tab) controller.tabs.splitWithNew();
      return;
    case 'tasks-selection':
      assistantService?.open(controller, {
        selection: { text: request.text, ...page },
        tasksFromSelection: true,
      });
      return;
    case 'note-selection': {
      if (!persistence) return;
      const quote = request.text
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const from = page.title.trim() || hostOf(page.url) || 'the web';
      const link = /^https?:/i.test(page.url)
        ? `[${from.replace(/[[\]]/g, '')}](${page.url})`
        : from;
      const note = noteFromMarkdown(from, `${quote}\n\nFrom ${link}`);
      const id = persistence.notes.create();
      persistence.notes.save(id, note.doc, note.text);
      controller.notes.open(id);
      return;
    }
    case 'pdf-note':
    case 'pdf-notes': {
      // Orbit's notes on a PDF (roadmap R2 M4): one note per PDF, beside it; quotes are added
      // to it. They're Orbit's — the PDF file itself is never changed.
      if (!persistence || !page.url) return;
      const notes = persistence.notes;
      const key = page.url.split('#')[0]!;
      const map = { ...persistence.settings.get('pdf.notes') };
      let id = map[key];
      if (!id || notes.title(id) === null) {
        const name = page.title.trim() || decodeURIComponent(key.split('/').pop() ?? '') || 'PDF';
        const where = /^https?:/i.test(key)
          ? `[${name.replace(/[[\]]/g, '')}](${key})`
          : `${name} (on this Mac)`;
        const note = noteFromMarkdown(`Notes · ${name}`, `On ${where}`);
        id = notes.create();
        notes.save(id, note.doc, note.text);
        map[key] = id;
        const keys = Object.keys(map);
        for (const old of keys.slice(0, Math.max(0, keys.length - 500))) delete map[old];
        persistence.settings.set('pdf.notes', map);
      }
      if (request.kind === 'pdf-note' && request.text.trim()) {
        const current = notes.get(id);
        if (current) {
          const quote = request.text
            .trim()
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n');
          const next = appendMarkdown(current.doc, current.text, quote);
          notes.save(id, next.doc, next.text);
        }
        toast(controller, 'Added to PDF Notes');
      }
      controller.notes.open(id);
      controller.notes.refresh();
      return;
    }
    case 'ask-page':
      assistantService?.open(controller, { attachPage: true });
      return;
    case 'summarize-page':
      assistantService?.open(controller, { summarize: true });
      return;
    case 'image-info':
      if (tab) {
        void toolkitService?.inspectImage(
          controller,
          tab.view.webContents,
          request.src,
          request.alt,
        );
      }
      return;
    case 'annotate-page':
      void toolkitService?.annotate(controller);
      return;
    default:
      void captureService?.begin(controller, tab, request);
  }
}

/** Runs a command by id for a window (command bar items and menu items share these). */
function runCommand(controller: WindowController, commandId: string): void {
  const { tabs, layout } = controller;
  switch (commandId) {
    case 'new-tab-page':
      tabs.create();
      return;
    case 'toggle-sidebar':
      layout.toggleSidebar();
      return;
    case 'copy-url':
      if (copyActiveUrl(controller)) toast(controller, 'Copied link');
      return;
    case 'reload':
      if (tabs.active) navigateTab(tabs.active, 'reload');
      return;
    case 'close-tab':
      // ⌘W with Settings in front closes Settings.
      if (windows?.closeSettingsIfFocused()) return;
      if (tabs.active) tabs.close(tabs.active.id);
      return;
    case 'reopen-tab':
      tabs.reopenClosed();
      return;
    case 'import-arc':
      void importFromArc(controller);
      return;
    case 'new-space':
      controller.sidebar.newSpace();
      return;
    case 'split-view':
      tabs.splitWithNew();
      return;
    case 'exit-split':
      tabs.exitSplit();
      return;
    case 'swap-split':
      tabs.swapSplit();
      return;
    case 'archived-tabs':
      controller.tabs.create('orbit://archive');
      return;
    case 'settings':
      windows?.openSettings();
      return;
    case 'manage-apps':
      windows?.openSettings('apps');
      return;
    case 'new-easel':
      if (persistence) newEasel(persistence.easels, controller);
      return;
    case 'new-note':
      if (persistence) newNoteTab(persistence.notes, controller);
      return;
    case 'quick-note':
      if (persistence) toggleQuickNote(persistence.notes, controller);
      return;
    case 'toggle-tabs-top': {
      const next = persistence?.settings.get('tabs.layout') === 'top' ? 'sidebar' : 'top';
      persistence?.settings.set('tabs.layout', next);
      applyTabLayout(next);
      return;
    }
    case 'focus-start':
      focusService?.start(controller, {});
      return;
    case 'focus-end':
      focusService?.end(controller, false);
      return;
    case 'focus-open':
      openFocusView(controller);
      return;
    case 'sounds-stop':
      soundService?.stop();
      return;
    case 'toggle-appearance':
      toggleAppearance();
      return;
    case 'sounds-pause':
      soundService?.setPaused(!soundService.state.paused);
      return;
    case 'capture':
      void captureService?.begin(controller, controller.tabs.active, null);
      return;
    case 'toggle-notes':
      controller.notes.toggle();
      return;
    case 'open-projects':
      controller.notes.openAt('panel/projects');
      return;
    case 'open-tasks':
      controller.notes.openAt('panel/tasks');
      return;
    case 'open-notes':
      controller.notes.openAt('panel');
      return;
    case 'open-board':
      controller.notes.openAt('panel/board');
      return;
    case 'open-research':
      controller.notes.openAt('panel/research');
      return;
    case 'assistant':
      assistantService?.open(controller);
      return;
    case 'summarize-page':
      assistantService?.open(controller, { summarize: true });
      return;
    case 'group-tabs':
      openGrouping?.(controller);
      return;
    case 'app-library':
      controller.overlay.showAppLibrary(appLibraryView(controller));
      return;
    case 'open-pdf':
      void dialog
        .showOpenDialog(controller.win, {
          title: 'Open PDF',
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          properties: ['openFile', 'multiSelections'],
        })
        .then(({ canceled, filePaths }) => {
          if (canceled) return;
          for (const path of filePaths) openPdfFile?.(path);
        });
      return;
    case 'voice':
      // ⇧⌘Space: the voice popup (again while listening: finish now).
      void voiceToggle?.('popup', controller.win.webContents.id);
      return;
    case 'toolkit':
      toolkitService?.open(controller);
      return;
    case 'close-duplicates':
      controller.sidebar.closeDuplicates();
      return;
    case 'sort-today-site':
    case 'sort-today-title':
    case 'sort-today-recent':
      controller.sidebar.sortToday(
        commandId === 'sort-today-site'
          ? 'site'
          : commandId === 'sort-today-title'
            ? 'title'
            : 'recent',
      );
      return;
    case 'archive-before-today':
      controller.sidebar.archiveBeforeToday();
      return;
    case 'format-json':
      toolkitService?.open(controller, 'code');
      return;
    case 'pick-color':
      void toolkitService?.pickColor(controller);
      return;
    case 'annotate-screenshot':
      void toolkitService?.annotate(controller);
      return;
    case 'screenshot': {
      // ⇧⌘2: drag an area of the page (a click takes all of it), then choose what to do.
      const tab = controller.tabs.active;
      if (tab?.state.kind !== 'web') return;
      controller.overlay.closeShot();
      controller.overlay.startCapture(tab.view.getBounds());
      return;
    }
    case 'responsive': {
      // Toggles: on at a phone's size, or back to normal.
      const active = controller.tabs.active?.id;
      const on = controller.tabs.snapshot().tabs.find((t) => t.id === active)?.viewport;
      const phone = VIEWPORT_PRESETS.find((p) => p.name === 'iPhone 15')!;
      toolkitService?.setViewport(
        controller,
        on ? null : { width: phone.width, height: phone.height, mobile: true },
      );
      return;
    }
    case 'float-note':
      if (persistence) floatingNotes?.show(persistence.notes.create());
      return;
    case 'live-rss':
    case 'live-pulls':
    case 'live-issues':
      void addLiveFolder(
        controller,
        commandId === 'live-rss' ? 'rss' : commandId === 'live-pulls' ? 'pulls' : 'issues',
        tabs.space.id,
      );
      return;
    case 'live-refresh':
      void liveFolders?.refreshAll().then(() => toast(controller, 'Live Folders refreshed'));
      return;
    case 'manage-spaces':
      controller.library.open('spaces');
      return;
    case 'tidy':
      void runTidy?.(controller);
      return;
    case 'library':
      controller.library.open('media');
      return;
    case 'new-boost': {
      const page = tabs.active?.state.kind === 'web' ? tabs.active.state.url : '';
      if (boostService) openBoostEditor(controller, boostService.create(domainForPage(page)).id);
      return;
    }
  }
  // ⌘T's "Play Rain" and the like.
  const sound = /^sound-(.+)$/.exec(commandId)?.[1];
  const parsed = sound ? soundIdSchema.safeParse(sound) : null;
  if (parsed?.success) soundService?.toggle(parsed.data);
}

// HTTP authentication (F-31): ask for a username and password in the page's window.
app.on('login', (event, contents, details, authInfo, callback) => {
  const owner = contents ? windows?.tabForContents(contents.id) : null;
  if (!owner) return; // let it fail (popups, background requests)
  event.preventDefault();
  void owner.window.overlay
    .ask({ kind: 'login', host: authInfo.host, realm: authInfo.realm || details.url })
    .then((answer) => {
      if (answer.allow && answer.username !== undefined)
        callback(answer.username, answer.password ?? '');
      else callback();
    });
});

app.on('second-instance', () => {
  // (Not the hidden window that plays focus sounds.)
  const win = BrowserWindow.getAllWindows().find((w) => w.isVisible());
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  // Floating notes are windows too: reopen the main window whenever none is open.
  if (windows && windows.all().length === 0) windows.createMainWindow();
});

app.on('before-quit', () => {
  floatingNotes?.willQuit(); // they close with the app, but reopen next launch
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  lifecycle?.stop();
  liveFolders?.stop();
  sidebarStore?.close();
  persistence?.close();
  persistence = null;
});

void app.whenReady().then(() => {
  // The packaged app gets its icon from the bundle; in development, show it in the Dock too.
  if (!app.isPackaged) app.dock?.setIcon(join(import.meta.dirname, '../../resources/icon.png'));
  // A backup staged for restoring (roadmap P4.7) takes the current data's place first.
  if (applyPendingRestore(app.getPath('userData'))) console.log('[orbit] restored from backup');
  persistence = openPersistence(app.getPath('userData'));
  applyAppearance(persistence.settings.get('appearance')); // before any window is drawn
  const store = new SidebarStore(persistence.sidebar);
  sidebarStore = store;
  arcImporter = new ArcImporter(store, persistence.history);
  // Boosts (F-18) reach every page Electron creates — tabs, Peek, Little Orbit, popups — but
  // never Orbit's own UI (which, in development, is served from localhost).
  const devOrigin = devServer ? new URL(devServer).origin : null;
  const boosts = new BoostService(
    persistence.boosts,
    (contents) =>
      senders.has(contents.id) || (devOrigin !== null && contents.getURL().startsWith(devOrigin)),
  );
  boostService = boosts;
  // Live Folders (F-28): fetched by main (never by a page), in the default session.
  // AI (F-29) and GitHub (roadmap P4.2) secrets: Keychain-encrypted. Development builds can
  // point the SDKs at stand-in servers and skip the Keychain (the e2e tests do; packaged
  // Orbit never).
  const devOnly = (name: string) => (app.isPackaged ? undefined : process.env[name]);
  const testCipher: Cipher | null = devOnly('ORBIT_TEST_PLAIN_KEYS')
    ? {
        isEncryptionAvailable: () => true,
        encryptString: (text) => Buffer.from(text, 'utf8'),
        decryptString: (data) => data.toString('utf8'),
      }
    : null;
  const githubKey = new AiKeyStore(
    join(app.getPath('userData'), 'github-token.bin'),
    testCipher ?? safeStorage,
  );
  // Unsplash backgrounds (brief M4) with the owner's own access key, in the Keychain.
  const unsplashKey = new AiKeyStore(
    join(app.getPath('userData'), 'unsplash-key.bin'),
    testCipher ?? safeStorage,
  );
  const unsplash = new UnsplashService({
    key: () => unsplashKey.get(),
    fetch: (url, init) => net.fetch(url, init),
    apiUrl: devOnly('ORBIT_UNSPLASH_API_URL'),
  });
  const github = new GithubService({
    fetch: (url, init) => net.fetch(url, init),
    token: () => githubKey.get(),
    apiUrl: devOnly('ORBIT_GITHUB_API_URL'),
  });
  const live = new LiveFolderService({
    store,
    fetch: (url, init) => net.fetch(url, init),
    isOpen: (itemId) => windows?.all().some((c) => c.tabs.get(itemId) !== undefined) ?? false,
    githubToken: () => githubKey.get(),
  });
  liveFolders = live;
  live.start();

  // AI (F-29): the user's Anthropic key.
  const keyStore = new AiKeyStore(
    join(app.getPath('userData'), 'anthropic-key.bin'),
    testCipher ?? safeStorage,
  );
  const ai = (aiServiceRef = new AIService({
    apiKey: () => keyStore.get(),
    baseURL: devOnly('ORBIT_ANTHROPIC_BASE_URL'),
    prefs: () => persistence!.settings.get('ai.prefs'),
    activity: persistence.aiActivity,
  }));
  const refreshSidebars = () => windows?.all().forEach((c) => c.tabs.refresh());
  const tidy = new TidyService({
    store,
    ai,
    onChange: refreshSidebars,
    suggestions: () => persistence!.settings.get('tabs.groupSuggestions'),
  });
  app.on('web-contents-created', (_event, contents) => {
    boosts.attach(contents);
    attachJsonViewer(contents); // JSON responses show as a tree (roadmap P3.6)
  });
  /** One session per profile (F-17). The default profile keeps Electron's default session, so
   *  logins from before profiles existed carry over. */
  // Downloads go straight to ~/Downloads (tests use their own folder) and show on the shelf.
  const downloads = new DownloadService(
    persistence.db,
    () => process.env['ORBIT_DOWNLOADS_DIR'] ?? app.getPath('downloads'),
    (snapshot) => broadcaster.send('state:downloads', snapshot),
    // Arc's flourish: the download flies from its page into the sidebar's shelf.
    (from) => {
      const owner = windows?.tabForContents(from.id);
      if (!owner) return;
      const { window, tab } = owner;
      const page = tab.view.getBounds();
      // A tab opened only to download (its first and only navigation) closes, like Chrome and
      // Arc — the file is on the shelf, an empty tab would be left behind.
      const history = from.navigationHistory;
      if (history.length() <= 1 && !history.canGoBack() && tab.state.kind === 'web') {
        const committed = from.getURL();
        if (committed === '' || committed === tab.state.url) {
          setTimeout(() => window.tabs.close(tab.id), 0);
        }
      }
      const layout = window.layout.current();
      const [, height = 0] = window.win.getContentSize();
      window.overlay.flyDownload(
        { x: page.x + page.width / 2, y: page.y + Math.min(page.height / 2, 260) },
        // Into the sidebar's shelf, the tab strip's Downloads button, or the corner.
        layout.sidebar.visible
          ? { x: 34, y: height - 86 }
          : layout.tabStrip
            ? { x: layout.tabStrip.width - 28, y: layout.tabStrip.height / 2 }
            : { x: 22, y: height - 30 },
      );
    },
  );
  downloadService = downloads;
  const captures = new CaptureRequests();
  captureService = new CaptureService({
    captures: persistence.captures,
    work: persistence.work,
    settings: persistence.settings,
    requests: captures,
    toast,
    changed: (controller) => controller.notes.refresh(),
  });
  const captureFlow = captureService;
  // The Toolkit (roadmap P3.5, P3.6): Annotate Screenshot opens the picture on a new Easel.
  const pendingAnnotations = new Map<string, EaselCapture>();
  /** A picture on a new Easel, to mark up (Annotate Screenshot; the screenshot card). */
  const annotateCapture = (controller: WindowController, capture: EaselCapture) => {
    const easel = persistence!.easels.create({
      title: `Notes on ${capture.sourceTitle || hostOf(capture.sourceUrl) || 'a page'}`.slice(
        0,
        120,
      ),
      spaceId: controller.tabs.space.id,
    });
    pendingAnnotations.set(easel.id, capture);
    controller.tabs.create(easelUrl(easel.id));
  };
  const toolkit = new ToolkitService({
    settings: persistence.settings,
    push: (controller, state) => {
      const contents = controller.notes.contents;
      if (contents) broadcaster.sendTo(contents, 'toolkit:update', state);
    },
    toast,
    captures,
    annotate: annotateCapture,
    ports: devOnly('ORBIT_TEST_DEV_PORTS')
      ?.split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
  });
  toolkitService = toolkit;
  const media = new MediaLibrary(join(app.getPath('userData'), 'Captures'), downloads);

  // Site permissions: ask in the window's overlay, remember per site (F-31).
  const permissions = new PermissionService(persistence.siteSettings, (contents) => {
    const owner = windows?.tabForContents(contents.id);
    return owner?.window.overlay ?? null;
  });
  // Chrome extensions (ADR-008): chrome.tabs calls land in the focused window.
  const extensionHost = new ExtensionHost({
    createTab: (url, active) => {
      const controller = windows?.focused();
      if (!controller) return null;
      const tab = controller.tabs.create(url, { activate: active });
      return [tab.view.webContents, controller.win];
    },
    selectTab: (contents) => {
      const owner = windows?.tabForContents(contents.id);
      owner?.window.tabs.activate(owner.tab.id);
    },
    removeTab: (contents) => {
      const owner = windows?.tabForContents(contents.id);
      owner?.window.tabs.close(owner.tab.id);
    },
  });
  // Extension updates: a minute after launch, then every 6 hours.
  const updateExtensions = () => void extensionHost.update();
  setTimeout(updateExtensions, 60_000).unref();
  setInterval(updateExtensions, 6 * 3_600_000).unref();
  // PDFs from this Mac (roadmap R2 M4): only files you opened, at random orbit-pdf:// addresses.
  const localPdfs = new LocalPdfs({
    get: () => persistence!.settings.get('pdf.local'),
    set: (list) => persistence!.settings.set('pdf.local', list),
  });
  const pdfSessions = new WeakSet<Session>();
  const sessionFor = (profileId: string): Session | undefined => {
    const profile = store.profiles.find((p) => p.id === profileId);
    const s =
      !profile || profile.id === DEFAULT_PROFILE_ID
        ? session.defaultSession
        : session.fromPartition(profile.partition);
    permissions.configure(s); // once per session
    downloads.configure(s, profileId);
    void extensionHost.configure(s);
    if (!pdfSessions.has(s)) {
      pdfSessions.add(s);
      s.protocol.handle(PDF_SCHEME, (request) => localPdfs.respond(request));
    }
    return s;
  };
  sessionFor(DEFAULT_PROFILE_ID);
  windows = new WindowManager({
    settings: persistence.settings,
    store,
    archive: persistence.archive,
    sessionFor,
    history: persistence.history,
    zoomFor: (url) => persistence?.siteSettings.zoomFor(url) ?? 0,
    redirectFor: (url) => focusService?.blockedRedirect(url) ?? null,
    extensions: extensionHost,
    siteSetting: (url, key) => {
      try {
        return persistence?.siteSettings.get(new URL(url).origin, key) ?? null;
      } catch {
        return null;
      }
    },
    senders,
    broadcaster,
    preloadPath: join(import.meta.dirname, '../preload/shell.cjs'),
    internalPreloadPath: join(import.meta.dirname, '../preload/internal.cjs'),
    loadRenderer,
    loadInternal,
    loadOverlay,
    runCommand,
    templates: {
      save: (controller, spaceId) => {
        const saved = saveSpaceAsTemplate(store, persistence!.templates, spaceId);
        toast(
          controller,
          saved
            ? `Saved “${saved.name}” as a template (${saved.tabs} ${saved.tabs === 1 ? 'tab' : 'tabs'})`
            : 'Open some pages in this Space first',
        );
      },
      list: () => persistence!.templates.list().map(({ id, name }) => ({ id, name })),
      use: (controller, templateId) => {
        const space = spaceFromTemplate(store, persistence!.templates, templateId, {
          profileId: controller.tabs.space.profileId,
        });
        if (space) controller.tabs.switchSpace(space.id);
      },
    },
    capture: (controller, tabId, request) => pageMenuRequest(controller, tabId, request),
    tidyState: (spaceId) => tidy.state(spaceId),
    onTabsChange: (controller) => {
      assistantService?.pageChanged(controller);
      toolkitService?.pageChanged(controller);
    },
    liveFolders: {
      add: (controller, kind, spaceId) => void addLiveFolder(controller, kind, spaceId),
      refresh: (folderId) => void (folderId ? live.refresh(folderId) : live.refreshAll()),
      markAllRead: (folderId) => live.markAllRead(folderId),
    },
  });
  const windowManager = windows;

  // Handlers are registered before any window loads, so the shell's first call always lands.
  const router = new IpcRouter(ipcMain, senders);
  registerAppHandlers(router);
  registerLayoutHandlers(router, windowManager);
  registerTabHandlers(router, windowManager, { openWindow: (url) => openLittle?.(url) });
  registerAppHubHandlers(router, windowManager, { openWindow: (url) => openLittle?.(url) });

  // Orbit accounts and cloud sync (docs/FIREBASE.md). Optional: without an account everything
  // stays on this Mac. The session is Keychain-encrypted in its own file; development builds
  // can point at the Firebase Emulator (packaged Orbit never).
  const cloud = cloudConfig({ ...import.meta.env } as CloudEnv, {
    ORBIT_FIREBASE_EMULATOR: devOnly('ORBIT_FIREBASE_EMULATOR'),
    ORBIT_FIREBASE_PROJECT: devOnly('ORBIT_FIREBASE_PROJECT'),
  });
  const cloudFetch: Fetch = (url, init) => net.fetch(url, init);
  const accountKey = new AiKeyStore(
    join(app.getPath('userData'), 'account.bin'),
    testCipher ?? safeStorage,
  );
  const google = cloud?.google ?? null;
  const accounts = new AccountService({
    config: cloud,
    db: persistence.db,
    fetchImpl: cloudFetch,
    store: {
      get canStore() {
        return accountKey.canStore;
      },
      get: () => accountKey.get(),
      set: (value) => accountKey.set(value),
      clear: () => accountKey.clear(),
    },
    googleSignIn: google
      ? (signal) =>
          googleSignIn({
            ...google,
            fetchImpl: cloudFetch,
            openExternal: (url) => shell.openExternal(url),
            signal,
          })
      : null,
    // Settings (a window, or a tab) shows the account and its sync state.
    onChange: (view) => {
      for (const id of senders.idsOf('internal')) {
        const contents = webContents.fromId(id);
        if (contents && windowManager.settingsFor(id)) {
          broadcaster.sendTo(contents, 'account:update', view);
        }
      }
    },
    // Another Mac's changes arrived: the sidebar, the productivity panel and open pages follow.
    onApplied: (kinds, removed) => {
      if (kinds.has('profile') || kinds.has('space') || kinds.has('item')) {
        for (const { kind, id } of removed) {
          if (kind === 'item') windowManager.all().forEach((c) => c.tabs.unload(id));
        }
        store.reload();
      }
      if (kinds.has('project') || kinds.has('task') || kinds.has('note')) {
        windowManager.all().forEach((c) => c.notes.refresh());
      }
    },
  });
  registerAccountHandlers(router, windowManager, accounts);
  accounts.restore();

  // Google Drive, read-only (roadmap R2 M3): its own Google connection (the same Desktop OAuth
  // client), the refresh token Keychain-encrypted in its own file. Development builds may use a
  // stand-in for Google (tests); the packaged app always talks to Google.
  const googleTest = devOnly('ORBIT_GOOGLE_TEST_BASE');
  const driveKey = new AiKeyStore(
    join(app.getPath('userData'), 'google-drive.bin'),
    testCipher ?? safeStorage,
  );
  const drive = new DriveService({
    google: google ?? (googleTest ? { clientId: 'test-client', clientSecret: 'test' } : null),
    fetchImpl: cloudFetch,
    // Tests: "the browser" just follows Google's redirect back to Orbit.
    openExternal: googleTest
      ? (url) => void net.fetch(url).catch(() => undefined)
      : (url) => shell.openExternal(url),
    store: {
      get canStore() {
        return driveKey.canStore;
      },
      get: () => driveKey.get(),
      set: (value) => driveKey.set(value),
      clear: () => driveKey.clear(),
    },
    onChange: (status) => {
      for (const id of senders.idsOf('internal')) {
        const contents = webContents.fromId(id);
        if (contents && windowManager.settingsFor(id)) {
          broadcaster.sendTo(contents, 'drive:update', status);
        }
      }
    },
    ...(googleTest
      ? {
          endpoints: {
            auth: `${googleTest}/google/auth`,
            token: `${googleTest}/google/token`,
            revoke: `${googleTest}/google/revoke`,
            api: googleTest,
          },
        }
      : {}),
  });
  driveService = drive;
  registerDriveHandlers(router, windowManager, drive);
  // Coming back to Orbit, or the Mac waking: other Macs may have changed something.
  app.on('browser-window-focus', () => accounts.pullSoon());
  powerMonitor.on('resume', () => void accounts.syncNow());
  const wallpaperService = new WallpaperService(
    app.getPath('userData'),
    persistence.settings,
    unsplash,
  );
  // The window's canvas (UI spec §4): the wallpaper behind everything, and the theme from it.
  const canvas = new CanvasService({
    choice: () => wallpaperService.canvasChoice(),
    customImage: () => wallpaperService.state().customImage,
    customFile: () => wallpaperService.customFile(),
    look: () => persistence!.settings.get('newtab.look'),
    ui: () => persistence!.settings.get('ui'),
    cache: {
      get: () => persistence!.settings.get('canvas.palettes'),
      set: (entries) => persistence!.settings.set('canvas.palettes', entries),
    },
    readPixels: readThumbnail,
    photoFile: (name) => {
      const built = join(rendererDir, 'wallpapers', name);
      return existsSync(built)
        ? built
        : join(app.getAppPath(), 'src/renderer/public/wallpapers', name);
    },
    publish: (state) => {
      broadcaster.send('state:canvas', state);
      const light = { ...state, customImage: null };
      for (const id of senders.idsOf('internal')) {
        const contents = webContents.fromId(id);
        if (contents) broadcaster.sendTo(contents, 'canvas:update', light);
      }
    },
  });
  canvasService = canvas;
  wallpaperService.onChange(() => canvas.refresh());
  router.handle('canvas:get', (_input, { sender }) =>
    senders.surfaceOf(sender) === 'internal'
      ? { ...canvas.state, customImage: null }
      : canvas.state,
  );
  registerNewTabHandlers(router, windowManager, wallpaperService, {
    home: persistence.home,
    settings: persistence.settings,
    history: persistence.history,
    work: persistence.work,
    // The panel's projects and tasks follow changes made on the new tab page.
    workChanged: () => windowManager.all().forEach((c) => c.notes.refresh()),
    notes: persistence.notes,
    unsplash,
    weather: new WeatherService({
      fetch: (url) => net.fetch(url),
      geocodeUrl: devOnly('ORBIT_GEOCODE_URL'),
      forecastUrl: devOnly('ORBIT_FORECAST_URL'),
    }),
    openNote: (controller, id) => {
      if (persistence?.notes.title(id) !== null) controller.tabs.create(noteUrl(id));
    },
    openApp: (controller, itemId) =>
      void openFavorite(controller, itemId, (url) => openLittle?.(url)),
    ask: (controller, text) => assistantService?.open(controller, { prompt: text }),
    aiAvailable: () => aiServiceRef?.available ?? false,
    driveRecent: async () => {
      if (!driveService?.connected) return null;
      const now = Date.now();
      return (await driveService.search('', { limit: 6, timeoutMs: 8000 })).flatMap((f) =>
        f.webViewLink
          ? [
              {
                id: f.id,
                name: f.name,
                kind: driveKind(f.mimeType),
                edited: editedLabel(f.modifiedTime, now),
                url: f.webViewLink,
              },
            ]
          : [],
      );
    },
  });
  registerFindHandlers(router, windowManager);
  registerSidebarHandlers(router, windowManager);
  router.handle(
    'media:get',
    (_i, { sender }) => windowManager.forSender(sender.webContentsId)?.media.current() ?? null,
  );
  router.handle('media:control', async ({ action }, { sender }) => {
    await windowManager.forSender(sender.webContentsId)?.media.control(action);
  });
  // The video pop-out's own page (its buttons): only that page may drive it.
  const popoutOf = (webContentsId: number) => {
    const owner = windowManager.all().find((c) => c.popout.isControls(webContentsId));
    if (!owner) throw new Error(`Sender ${webContentsId} is not the video pop-out`);
    return owner.popout;
  };
  router.handle('popout:get', (_i, { sender }) => popoutOf(sender.webContentsId).view());
  router.handle('popout:action', ({ action }, { sender }) => {
    popoutOf(sender.webContentsId).act(action);
  });
  router.handle('little:get', (_i, { sender }) => {
    const little = littleWindows.get(sender.webContentsId);
    return { url: little?.url ?? '', title: little?.title ?? '' };
  });
  router.handle('little:navigate', ({ input }, { sender }) => {
    littleWindows.get(sender.webContentsId)?.navigate(input);
  });
  router.handle('little:promote', (_i, { sender }) => {
    littleWindows.get(sender.webContentsId)?.promote();
  });
  router.handle('browser:defaultStatus', () => ({
    isDefault: app.isDefaultProtocolClient('https'),
  }));
  router.handle('browser:makeDefault', () => {
    // macOS asks the user to confirm; the packaged app must be the one registering.
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
    return { isDefault: app.isDefaultProtocolClient('https') };
  });
  router.handle('downloads:get', () => downloadService?.snapshot() ?? { items: [] });
  router.handle('downloads:recent', async () => ({
    items: (await downloadService?.recent()) ?? [],
  }));
  router.handle('downloads:act', async ({ id, action }, { sender }) => {
    const service = downloadService;
    if (!service) return;
    if (action === 'open') service.open(id);
    else if (action === 'reveal') service.reveal(id);
    else if (action === 'cancel') service.cancel(id);
    else if (action === 'dismiss') service.dismiss(id);
    else {
      const contents = windowManager.forSender(sender.webContentsId)?.win.webContents;
      if (contents) await service.startDrag(id, contents);
    }
  });
  registerInternalPageHandlers(router, windowManager, {
    sidebarsChanged: refreshSidebars,
    archive: persistence.archive,
    settings: persistence.settings,
    history: persistence.history,
    applyLittleShortcut,
    clearProfileData: async (partition) => {
      const s = session.fromPartition(partition);
      await s.clearStorageData();
      await s.clearCache();
    },
    revealData: () => void shell.openPath(app.getPath('userData')),
    applyTabLayout,
    applyAppearance,
    templates: persistence.templates,
    projectTemplates: persistence.projectTemplates,
    github: {
      status: () => ({ hasToken: githubKey.has(), canStore: githubKey.canStore }),
      setToken: (input) => {
        const token = cleanGithubToken(input);
        if (!token)
          return {
            ok: false,
            error: 'That doesn’t look like a GitHub token (ghp_… or github_pat_…)',
          };
        try {
          githubKey.set(token);
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        github.reset();
        return { ok: true, error: null };
      },
      clearToken: () => {
        githubKey.clear();
        github.reset();
      },
    },
    ai: {
      status: () => ({
        hasKey: keyStore.has(),
        canStore: keyStore.canStore,
        model: TIDY_MODEL,
        prefs: persistence!.settings.get('ai.prefs'),
        usage: persistence!.aiActivity.usage(),
      }),
      setKey: (input) => {
        const key = cleanApiKey(input);
        if (!key)
          return { ok: false, error: 'That doesn’t look like an Anthropic API key (sk-ant-…)' };
        try {
          keyStore.set(key);
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        refreshSidebars(); // Tidy appears
        return { ok: true, error: null };
      },
      clearKey: () => {
        keyStore.clear();
        refreshSidebars();
      },
      setPrefs: (patch) => {
        const next = { ...persistence!.settings.get('ai.prefs'), ...patch };
        persistence!.settings.set('ai.prefs', next);
        refreshSidebars(); // Tidy shows only while AI is on
        windows?.all().forEach((c) => assistantService?.push(c));
      },
      activity: () => ({
        entries: persistence!.aiActivity.list(100),
        usage: persistence!.aiActivity.usage(),
      }),
      clearActivity: () => {
        persistence!.aiActivity.clear();
        windows?.all().forEach((c) => assistantService?.push(c));
      },
    },
  });
  runTidy = async (controller) => {
    try {
      const made = await tidy.tidy(controller.tabs.space);
      toast(
        controller,
        made > 0 ? `Tidied into ${made} folder${made === 1 ? '' : 's'}` : 'Nothing to group',
      );
    } catch (error) {
      toast(controller, error instanceof Error ? error.message : String(error));
    }
  };
  router.handle('sidebar:tidy', async (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller) await runTidy?.(controller);
  });
  router.handle('sidebar:untidy', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller) tidy.untidy(controller.tabs.space);
  });
  // Group Tabs (roadmap R2 M4): a preview in the overlay; nothing moves until it's accepted.
  openGrouping = (controller) => {
    const proposal = tidy.proposal(controller.tabs.space);
    if (proposal.groups.length === 0) {
      toast(controller, 'Nothing to group yet — Today needs a few tabs that belong together');
      return;
    }
    controller.overlay.showGrouping({ spaceId: controller.tabs.space.id, ...proposal });
  };
  router.handle('grouping:open', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller) openGrouping?.(controller);
  });
  router.handle('grouping:apply', ({ groups }, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (!controller) return;
    controller.overlay.closeGrouping();
    const made = tidy.group(controller.tabs.space, groups);
    toast(
      controller,
      made ? `Grouped into ${made} folder${made === 1 ? '' : 's'}` : 'Nothing to group',
    );
  });
  router.handle('grouping:dismiss', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (!controller) return;
    controller.overlay.closeGrouping();
    tidy.dismiss(controller.tabs.space);
  });
  registerSiteControlsHandlers(router, windowManager, {
    siteSettings: persistence.siteSettings,
    extensions: extensionHost,
    boosts,
    toast,
    resetZoom: (controller) => zoom(controller, 'reset'),
    saveCapture: (png) => media.saveCapture(png),
    captures,
    openInEasel: annotateCapture,
  });
  registerEaselHandlers(router, windowManager, { easels: persistence.easels, captures, toast });
  const notesRepo = persistence.notes;
  const settingsRepo = persistence.settings;
  const floating = new FloatingNotes({
    internalPreload: join(import.meta.dirname, '../preload/internal.cjs'),
    loadInternal,
    registerInternal: (id) => senders.add(id, 'internal'),
    unregisterInternal: (id) => senders.remove(id),
    persist: (open) => settingsRepo.set('notes.floating', open),
    onClosed: (id) => {
      const inTab = windowManager
        .all()
        .some((c) => c.tabs.snapshot().tabs.some((t) => t.url === noteUrl(id)));
      if (!inTab) notesRepo.deleteIfBlank(id);
    },
  });
  floatingNotes = floating;
  registerNotesHandlers(router, windowManager, { notes: notesRepo, floating });
  registerProfileHandlers(router, windowManager, { runCommand });
  registerWorkHandlers(
    router,
    windowManager,
    persistence.work,
    persistence.notes,
    persistence.captures,
    persistence.templates,
    persistence.projectTemplates,
    github,
  );
  registerCaptureHandlers(router, windowManager, captureFlow);
  router.handle('capture:open', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (!controller || controller.win.webContents.id !== sender.webContentsId) {
      throw new Error(`Sender ${sender.webContentsId} is not a shell`);
    }
    void captureFlow.begin(controller, controller.tabs.active, null);
  });
  // The assistant (roadmap Phase 3) in each window's productivity panel.
  const assistant = new AssistantService({
    ai,
    captures: (ids) => ids.flatMap((id) => persistence!.captures.get(id) ?? []),
    projectName: (projectId) =>
      (projectId && persistence!.work.project(projectId)?.name) || 'Tasks',
    addTasks: (projectId, tasks) => {
      for (const task of tasks) {
        persistence!.work.saveTask({
          projectId,
          title: task.title,
          description: task.notes,
          priority: 'medium',
          status: 'todo',
          dueDate: null,
        });
      }
      windowManager.all().forEach((c) => c.notes.refresh());
    },
    // Orbit AI as a coworker: your projects and tasks (Settings → AI → Projects and tasks).
    work: persistence.work,
    // A project you share in the assistant (brief M8): its brief, tasks and linked notes.
    projects: () =>
      persistence!.work
        .all()
        .projects.filter((p) => p.status !== 'done')
        .map((p) => ({ id: p.id, name: p.name })),
    projectContext: (projectId) => {
      const project = persistence!.work.project(projectId);
      if (!project) return null;
      const tasks = persistence!.work.all().tasks.filter((t) => t.projectId === projectId);
      const notes = persistence!.notes.linked().filter((n) => n.projectId === projectId);
      const lines = [
        `Project: ${project.name} (${project.status})`,
        project.description ? `Brief: ${project.description}` : null,
        project.startDate ? `Starts: ${project.startDate}` : null,
        project.dueDate ? `Due: ${project.dueDate}` : null,
        '',
        `Tasks (${tasks.filter((t) => t.status === 'done').length} of ${tasks.length} done):`,
        ...tasks.map(
          (t) =>
            `- [${t.status === 'done' ? 'x' : t.status === 'doing' ? '~' : ' '}] ${t.title}` +
            `${t.dueDate ? ` (due ${t.dueDate})` : ''} · ${t.priority} priority` +
            `${t.description ? ` — ${t.description.slice(0, 300)}` : ''}`,
        ),
        '',
        notes.length ? 'Notes:' : '',
        ...notes.slice(0, 10).map((n) => {
          const text = persistence!.notes.get(n.id)?.text ?? '';
          return `## ${n.title}\n${text.slice(0, 1500)}`;
        }),
      ];
      return {
        name: project.name,
        text: lines
          .filter((l): l is string => typeof l === 'string')
          .join('\n')
          .slice(0, 30_000),
      };
    },
    startFocus: (controller, input) => focusService?.start(controller, input),
    workChanged: () => windowManager.all().forEach((c) => c.notes.refresh()),
    // Orbit AI's browser tools (roadmap R2 M2): tabs, apps, history and notes, as allowed.
    browser: (controller, userWords) =>
      browserToolDeps(
        controller,
        {
          history: persistence!.history,
          notes: persistence!.notes,
          openApp: (target, itemId) => openFavorite(target, itemId, (url) => openLittle?.(url)),
          notesChanged: () => windowManager.all().forEach((c) => c.notes.refresh()),
          drive: driveService,
        },
        userWords,
      ),
    saveNote: (doc, text, projectId) => {
      const id = persistence!.notes.create(Date.now(), projectId);
      persistence!.notes.save(id, doc, text);
      windowManager.all().forEach((c) => c.notes.refresh());
      return id;
    },
    push: (controller, state) => {
      const contents = controller.notes.contents;
      if (contents) broadcaster.sendTo(contents, 'assistant:update', state);
    },
    onState: (controller, state) => assistantAnswerHook?.(controller, state),
    toast,
  });
  assistantService = assistant;
  registerAssistantHandlers(router, windowManager, assistant);
  registerToolkitHandlers(router, windowManager, toolkit, pendingAnnotations);
  // Backups (roadmap P4.7): to a folder you choose; optionally daily, optionally encrypted.
  const backupKey = new AiKeyStore(
    join(app.getPath('userData'), 'backup-passphrase.bin'),
    testCipher ?? safeStorage,
  );
  const backups = new BackupService({
    db: persistence.db,
    userData: app.getPath('userData'),
    appVersion: app.getVersion(),
    passphrase: () => backupKey.get(),
  });
  let backupError: string | null = null;
  const runAutoBackup = async (force: boolean) => {
    const auto = persistence!.settings.get('backup.auto');
    if (!auto) return;
    try {
      const file = await backups.autoBackup(
        auto.folder,
        auto.keep,
        force ? null : persistence!.settings.get('backup.last'),
      );
      if (file) persistence!.settings.set('backup.last', Date.now());
      backupError = null;
    } catch (error) {
      backupError = error instanceof Error ? error.message : String(error);
      console.error('[orbit] automatic backup failed', error);
    }
  };
  setTimeout(() => void runAutoBackup(false), 30_000).unref();
  setInterval(() => void runAutoBackup(false), 6 * 3_600_000).unref();
  registerBackupHandlers(router, windowManager, {
    backups,
    settings: persistence.settings,
    passphrase: backupKey,
    lastError: () => backupError,
    runAuto: runAutoBackup,
  });
  registerTooltipHandlers(router, windowManager);
  // Focus sounds play in one hidden Orbit page (Web Audio), only while something plays.
  let soundHostId: number | null = null;
  const sounds = new SoundService({
    settings: persistence.settings,
    openHost: (onReady) => {
      const host = new BrowserWindow({
        show: false,
        width: 320,
        height: 200,
        skipTaskbar: true,
        webPreferences: {
          preload: join(import.meta.dirname, '../preload/internal.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          // Its own sound, started from Orbit's UI: no click on this page is needed.
          autoplayPolicy: 'no-user-gesture-required',
          backgroundThrottling: false,
        },
      });
      const contents = host.webContents;
      soundHostId = contents.id;
      senders.add(contents.id, 'internal');
      contents.once('did-finish-load', onReady);
      contents.on('render-process-gone', () => {
        if (!host.isDestroyed()) host.destroy();
        sounds.hostGone();
      });
      loadInternal(host, 'orbit://sounds');
      return {
        send: (state) => broadcaster.sendTo(contents, 'sounds:update', state),
        close: () => {
          senders.remove(contents.id);
          if (soundHostId === contents.id) soundHostId = null;
          if (!host.isDestroyed()) host.destroy();
        },
      };
    },
    changed: (state) => {
      broadcaster.send('state:sounds', state);
      if (focusService) pushFocusView(focusService.view());
    },
  });
  soundService = sounds;

  // Voice (roadmap R2 M2): push-to-talk, transcribed on this Mac by a hidden page in a session
  // of its own — the only Orbit page that may use the microphone, and only for audio.
  const modelsRoot = process.env['ORBIT_MODELS_DIR'] ?? join(app.getPath('userData'), 'models');
  const fakeMic = Boolean(process.env['ORBIT_TEST_FAKE_MIC']);
  let voiceHostId: number | null = null;
  const voice = new VoiceService({
    modelReady: () => voiceModelReady(modelsRoot),
    download: (onProgress, signal) =>
      downloadVoiceModel(modelsRoot, {
        fetchImpl: (url, init) => net.fetch(url, init),
        onProgress,
        signal,
        // Development and tests may use a local mirror; the packaged app always uses Hugging Face.
        ...(!app.isPackaged && process.env['ORBIT_VOICE_MODEL_BASE']
          ? { baseUrl: process.env['ORBIT_VOICE_MODEL_BASE'] }
          : {}),
      }),
    micAccess: async () => {
      if (fakeMic) return true; // tests play a recording through Chromium's fake microphone
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'granted') return true;
      if (status === 'not-determined') return systemPreferences.askForMediaAccess('microphone');
      return false;
    },
    createHost: () => {
      const voiceSession = session.fromPartition('orbit-voice');
      const isHost = (contents: Electron.WebContents | null) =>
        contents !== null && contents.id === voiceHostId;
      voiceSession.setPermissionRequestHandler((contents, permission, callback, details) => {
        const media = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
        callback(isHost(contents) && permission === 'media' && media.every((m) => m === 'audio'));
      });
      voiceSession.setPermissionCheckHandler(
        (contents, permission, _origin, details) =>
          isHost(contents) &&
          permission === 'media' &&
          (!('mediaType' in details) || details.mediaType === 'audio'),
      );
      const host = new BrowserWindow({
        show: false,
        width: 200,
        height: 100,
        webPreferences: {
          preload: join(import.meta.dirname, '../preload/internal.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          session: voiceSession,
          backgroundThrottling: false,
          autoplayPolicy: 'no-user-gesture-required',
        },
      });
      const contents = host.webContents;
      voiceHostId = contents.id;
      senders.add(contents.id, 'internal');
      contents.on('will-navigate', (event) => event.preventDefault());
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      let loaded = false;
      const pending: HostCommand[] = [];
      const send = (command: HostCommand) =>
        broadcaster.sendTo(contents, 'voice:command', { command, at: Date.now() });
      contents.once('did-finish-load', () => {
        loaded = true;
        for (const command of pending.splice(0)) send(command);
      });
      const gone = () => {
        senders.remove(contents.id);
        if (voiceHostId === contents.id) voiceHostId = null;
        voiceService?.hostGone();
      };
      contents.on('render-process-gone', () => {
        if (!host.isDestroyed()) host.destroy();
      });
      host.once('closed', gone);
      if (devServer) void contents.loadURL(`${devServer}/voice/index.html`);
      else void contents.loadFile(join(rendererDir, 'voice', 'index.html'));
      return {
        send: (command) => (loaded ? send(command) : pending.push(command)),
        close: () => {
          if (!host.isDestroyed()) host.destroy();
        },
      };
    },
    broadcast: (state) => {
      broadcaster.send('state:voice', state);
      for (const controller of windowManager.all()) {
        broadcaster.sendTo(controller.overlay.view.webContents, 'state:voice', state);
        const panel = controller.notes.contents;
        if (panel) broadcaster.sendTo(panel, 'voice:update', state);
      }
    },
    onTranscript: (text, target) => voicePopup.heard(text, target),
    onWake: (rest) => voicePopup.woke(rest),
  });
  voiceService = voice;
  // The voice popup (Siri-style, owner request): ⇧⌘Space, Shift+Space outside text boxes, or
  // "Hey Orbit". What you say goes to Orbit AI — its answer shows (and is read) in the popup —
  // or, without AI, it's searched or opened.
  const voiceQuiet = process.env['ORBIT_QUIET'] === '1';
  let voiceWindow: WindowController | null = null;
  const awaitingAnswer = new WeakSet<WindowController>();
  const windowOfSender = (id: number) =>
    windowManager.forSender(id) ??
    windowManager.notesPanelFor(id) ??
    windowManager.tabForContents(id)?.window ??
    windowManager.focused() ??
    windowManager.all()[0] ??
    null;
  const answerFor = (controller: WindowController, text: string) => {
    const ai = aiServiceRef?.available ?? false;
    if (!ai) {
      const target = classifyInput(text);
      if (target) controller.tabs.create(target.url, { activate: true });
      const host = target?.kind === 'url' ? new URL(target.url).hostname.replace(/^www\./, '') : '';
      controller.overlay.showVoicePopup({
        heard: text,
        ai: false,
        answer: {
          status: 'done',
          text: host ? `Opened ${host}.` : `Searched the web for “${text}”.`,
          actions: [],
          error: null,
        },
      });
      return;
    }
    awaitingAnswer.add(controller);
    controller.overlay.showVoicePopup({
      heard: text,
      ai: true,
      answer: { status: 'thinking', text: '', actions: [], error: null },
    });
    // The popup reads the answer itself (not the panel, if it's open too).
    void assistantService?.ask(controller, text, 'ask', false);
  };
  const voicePopup = {
    open: (controller: WindowController, request?: string) => {
      const prefs = persistence!.settings.get('voice.prefs');
      voiceWindow = controller;
      controller.overlay.showVoicePopup(
        {
          ai: aiServiceRef?.available ?? false,
          speak: prefs.speakAnswers,
          voice: prefs.voice,
          quiet: voiceQuiet,
        },
        true,
      );
      if (request) answerFor(controller, request);
      else void voice.start('popup');
    },
    /** What was said, for the popup or the assistant panel. */
    heard: (text: string, target: 'bar' | 'popup' | 'panel') => {
      const controller = voiceWindow ?? windowManager.focused() ?? windowManager.all()[0];
      if (!controller) return;
      if (target === 'panel') assistantService?.open(controller, { prompt: text, spoken: true });
      else if (controller.overlay.isVoicePopupOpen) answerFor(controller, text);
    },
    /** "Hey Orbit" (and maybe a request in the same breath): Orbit comes forward and answers. */
    woke: (rest: string) => {
      const controller = windowManager.focused() ?? windowManager.all()[0];
      if (!controller || controller.overlay.isVoicePopupOpen) return;
      controller.win.show();
      app.focus({ steal: true });
      voicePopup.open(controller, rest || undefined);
    },
  };
  assistantAnswerHook = (controller, state) => {
    if (!awaitingAnswer.has(controller) || !controller.overlay.isVoicePopupOpen) return;
    const reply = state.messages.at(-1);
    if (reply?.role !== 'assistant') return;
    controller.overlay.showVoicePopup({
      answer: {
        status: reply.status,
        text: reply.parts.map((p) => p.text).join(''),
        actions: reply.actions.map((a) => ({ label: a.label, kind: a.kind })),
        error: reply.error,
      },
    });
    if (reply.status !== 'thinking' && reply.status !== 'writing')
      awaitingAnswer.delete(controller);
  };
  // "Hey Orbit" pauses while the screen is locked and (unless allowed) on battery.
  const batteryHold = () =>
    voice.holdWake(
      'battery',
      powerMonitor.isOnBatteryPower() && !persistence!.settings.get('voice.prefs').wakeOnBattery,
    );
  batteryHold();
  powerMonitor.on('on-battery', batteryHold);
  powerMonitor.on('on-ac', batteryHold);
  powerMonitor.on('lock-screen', () => voice.holdWake('locked', true));
  powerMonitor.on('unlock-screen', () => voice.holdWake('locked', false));
  if (persistence.settings.get('voice.prefs').wakeWord) {
    void voice.setWake(true).then((ok) => {
      if (!ok) {
        persistence!.settings.set('voice.prefs', {
          ...persistence!.settings.get('voice.prefs'),
          wakeWord: false,
        });
      }
    });
  }
  // Shift+Space starts the voice popup — except in a text box, where it types a space as usual.
  const EDITABLE = `(() => {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'IFRAME') return true;
    if (el.tagName === 'INPUT') return !['button','checkbox','radio','submit','reset','range','color','file','image'].includes(el.type);
    const role = el.getAttribute && el.getAttribute('role');
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
  })()`;
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (
        input.type !== 'keyDown' ||
        input.key !== ' ' ||
        !input.shift ||
        input.meta ||
        input.control ||
        input.alt ||
        contents.id === voiceHostId
      ) {
        return;
      }
      event.preventDefault();
      void contents
        .executeJavaScriptInIsolatedWorld(1004, [{ code: EDITABLE }])
        .catch(() => true)
        .then((editable) => {
          if (editable) {
            void contents.insertText(' ');
            return;
          }
          if (input.isAutoRepeat) return;
          const controller = windowOfSender(contents.id);
          if (!controller) return;
          if (controller.overlay.isVoicePopupOpen && voice.state.phase === 'listening')
            voice.stop();
          else voicePopup.open(controller);
        });
    });
  });

  registerVoiceHandlers(router, {
    voice,
    isHost: (webContentsId) => webContentsId === voiceHostId,
    readModelFile: (path) => readModelFile(modelsRoot, path),
    removeModel: async () => {
      await removeVoiceModel(modelsRoot);
      voice.modelRemoved();
    },
    modelReady: () => voiceModelReady(modelsRoot),
    settings: persistence.settings,
    openCommandBar: () => {
      const controller = windowManager.focused();
      if (controller && controller.overlay.mode === null) {
        windowManager.openCommandBar(controller, 'new');
      }
    },
    openMicSettings: () =>
      void shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      ),
    toggle: (voiceToggle = async (target, senderId) => {
      const controller = windowOfSender(senderId);
      if (!controller) return;
      if (target === 'popup') {
        if (controller.overlay.isVoicePopupOpen && voice.state.phase === 'listening') voice.stop();
        else voicePopup.open(controller);
        return;
      }
      voiceWindow = controller;
      if (target === 'bar' && controller.overlay.mode === null) {
        windowManager.openCommandBar(controller, 'new');
      }
      await voice.toggle(target);
    }),
    setWake: async (on) => {
      if (!on) {
        await voice.setWake(false);
        return null;
      }
      if (!voiceModelReady(modelsRoot)) {
        return 'Download the speech model first: press ⇧⌘Space once and choose Download.';
      }
      return (await voice.setWake(true))
        ? null
        : 'Orbit can’t use the microphone — allow it in System Settings → Privacy & Security.';
    },
    wakeOnBatteryChanged: batteryHold,
    popup: {
      close: (senderId) => {
        const controller = windowOfSender(senderId);
        if (!controller) return;
        controller.overlay.closeVoicePopup();
        if (voice.state.target === 'popup') voice.cancel();
        if (awaitingAnswer.has(controller)) {
          assistantService?.stop(controller);
          awaitingAnswer.delete(controller);
        }
        voice.holdWake('speaking', false);
      },
      toPanel: (senderId) => {
        const controller = windowOfSender(senderId);
        if (!controller) return;
        controller.overlay.closeVoicePopup();
        assistantService?.open(controller);
      },
      speaking: (speaking) => voice.holdWake('speaking', speaking),
    },
  });
  const pushFocusView = (view: FocusView) => {
    for (const controller of windowManager.all()) {
      const contents = controller.notes.contents;
      if (contents) broadcaster.sendTo(contents, 'focus:update', view);
    }
  };
  const focus = new FocusService({
    settings: persistence.settings,
    work: persistence.work,
    sounds,
    log: persistence.focusLog,
    chime: () => sounds.chime(),
    pushView: pushFocusView,
    broadcast: (session) => broadcaster.send('state:focus', session),
    // Test runs stay quiet (no notifications popping up on the owner's screen).
    notify: (title, body) => {
      if (process.env['ORBIT_QUIET'] === '1' || !Notification.isSupported()) return;
      new Notification({ title, body }).show();
    },
    toast,
  });
  focusService = focus;
  registerFocusHandlers(router, windowManager, focus, {
    sounds,
    isSoundHost: (id) => id === soundHostId,
    openView: openFocusView,
  });
  registerLibraryHandlers(router, windowManager, { downloads, media, boosts, toast });
  registerBoostHandlers(router, windowManager, { boosts, toast });
  // The customization engine (brief M2).
  router.handle('ui:get', () => persistence!.settings.get('ui'));
  // Settings → Integrations: the Unsplash access key (Settings only; never sent back).
  const settingsOnly = (id: number) => {
    if (!windowManager.settingsFor(id)) throw new Error(`Sender ${id} is not Settings`);
  };
  router.handle('unsplash:status', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return { hasKey: unsplashKey.has(), canStore: unsplashKey.canStore };
  });
  router.handle('unsplash:setKey', ({ key }, { sender }) => {
    settingsOnly(sender.webContentsId);
    const clean = key.trim();
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(clean)) {
      return { ok: false, error: 'That doesn’t look like an Unsplash access key' };
    }
    try {
      unsplashKey.set(clean);
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  router.handle('unsplash:clearKey', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    unsplashKey.clear();
  });
  router.handle('ui:set', (patch, { sender }) => {
    if (!windowManager.settingsFor(sender.webContentsId)) {
      throw new Error(`Sender ${sender.webContentsId} is not Settings`);
    }
    const next = { ...persistence!.settings.get('ui'), ...patch };
    persistence!.settings.set('ui', next);
    broadcaster.send('state:ui', next);
    canvasService?.refresh(); // the accent, glass and palette preferences shape the canvas
    for (const id of senders.idsOf('internal')) {
      const contents = webContents.fromId(id);
      if (contents) broadcaster.sendTo(contents, 'ui:update', next);
    }
    return next;
  });
  router.handle('appearance:toggle', (_input, { sender }) => {
    if (!windowManager.forSender(sender.webContentsId)) {
      throw new Error(`Sender ${sender.webContentsId} has no window`);
    }
    return toggleAppearance();
  });
  router.handle('tabs:copyUrl', (_input, { sender }) => {
    const controller = windowManager.forSender(sender.webContentsId);
    if (controller && copyActiveUrl(controller)) toast(controller, 'Copied link');
  });
  router.handle('tabs:devtools', ({ tabId }, { sender }) => {
    const contents = windowManager.forSender(sender.webContentsId)?.tabs.get(tabId)
      ?.view.webContents;
    if (!contents) return;
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: 'detach' });
  });
  registerCommandBarHandlers(
    router,
    windowManager,
    new CommandBarService(
      persistence.history,
      runCommand,
      process.env['ORBIT_DISABLE_SUGGESTIONS'] !== '1',
      (query) => {
        const { projects, tasks } = persistence!.work.all();
        const names = new Map(projects.map((p) => [p.id, p.name]));
        return {
          projects,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            projectId: t.projectId,
            project: t.projectId ? (names.get(t.projectId) ?? null) : null,
            done: t.status === 'done',
          })),
          notes: persistence!.notes.list(query),
          captures: persistence!.captures
            .list()
            .filter((c) => captureMatches(query, c))
            .slice(0, 2)
            .map((c) => ({
              id: c.id,
              label: captureLabel(c),
              host: hostOf(c.url),
              projectId: c.projectId,
              project: c.projectId ? (names.get(c.projectId) ?? null) : null,
            })),
        };
      },
      (query) =>
        persistence!.archive
          .list(query, 2)
          .map(({ id, title, url, favicon }) => ({ id, title, url, favicon })),
      () => toolkit.localServers(),
      {
        available: () => ai.available,
        ask: (controller, text, spoken) =>
          assistantService?.open(controller, { prompt: text, spoken }),
      },
      // Drive in the command bar: a quick look (it never holds the results up for long).
      async (query) => {
        if (!drive.connected) return [];
        const files = await drive.search(query, { limit: 3, timeoutMs: 900 });
        const now = Date.now();
        return files.flatMap((f) =>
          f.webViewLink
            ? [
                {
                  id: f.id,
                  name: f.name,
                  kind: driveKind(f.mimeType),
                  edited: editedLabel(f.modifiedTime, now),
                  url: f.webViewLink,
                },
              ]
            : [],
        );
      },
    ),
  );
  router.assertComplete();

  installAppMenu({
    toggleSidebar: () => windowManager.focused()?.layout.toggleSidebar(),
    openCommandBar: (mode) => {
      const controller = windowManager.focused();
      if (controller) windowManager.openCommandBar(controller, mode);
    },
    newTabPage: () => windowManager.focused()?.tabs.create(),
    newLittleWindow: openEmptyLittle,
    command: (id) => {
      const controller = windowManager.focused();
      if (controller) runCommand(controller, id);
    },
    copyUrlAsMarkdown: () => {
      const controller = windowManager.focused();
      if (controller && copyActiveUrl(controller, true)) toast(controller, 'Copied as Markdown');
    },
    find: (action) => {
      const controller = windowManager.focused();
      if (!controller) return;
      if (action === 'open') {
        controller.find.open();
        controller.win.webContents.focus(); // the find field lives in the shell's toolbar
      } else {
        controller.find.step(action);
      }
    },
    zoom: (action) => {
      const controller = windowManager.focused();
      if (controller) zoom(controller, action);
    },
    print: () => windowManager.focused()?.tabs.active?.view.webContents.print(),
    togglePin: () => {
      const controller = windowManager.focused();
      const id = controller?.tabs.activeItemId;
      if (controller && id) controller.sidebar.togglePin(id);
    },
    newSpace: () => windowManager.focused()?.sidebar.newSpace(),
    newFolder: () => windowManager.focused()?.sidebar.newFolder('pinned'),
    runLifecycle: () => {
      const result = lifecycle?.runNow();
      const controller = windowManager.focused();
      if (result && controller)
        toast(controller, `Archived ${result.archived}, slept ${result.slept}`);
    },
    importFromArc: () => {
      const controller = windowManager.focused();
      if (controller) void importFromArc(controller);
    },
    goToSpace: (n) => {
      const controller = windowManager.focused();
      const space = store.spaces[n - 1];
      if (controller && space) controller.tabs.switchSpace(space.id);
    },
    cycleSpace: (direction) => windowManager.focused()?.tabs.cycleSpace(direction),
    navigate: (action) => {
      const active = windowManager.focused()?.tabs.active;
      if (active) navigateTab(active, action);
    },
    cycleTab: (direction) => windowManager.focused()?.tabs.cycle(direction),
    goToTab: (n) => windowManager.focused()?.tabs.activateIndex(n),
    toggleTabDevTools: () => {
      const contents = windowManager.focused()?.tabs.active?.view.webContents;
      if (!contents) return;
      if (contents.isDevToolsOpened()) contents.closeDevTools();
      else contents.openDevTools({ mode: 'detach' });
    },
  });
  // Search engine from Settings (and kept in sync when it changes there).
  setSearchEngine(SEARCH_ENGINES[persistence.settings.get('search.engine')].url);

  lifecycle = new TabLifecycle(() => windowManager.all().map((c) => c.tabs), persistence.settings);
  lifecycle.start();

  // Daily database backup and archive trim, a few seconds after launch (never blocks startup).
  const db = persistence;
  setTimeout(() => {
    try {
      backupDatabase(db.db, join(app.getPath('userData'), 'backups'));
      db.archive.prune();
      db.home.pruneTodos();
    } catch (error) {
      console.error('[orbit] backup failed', error);
    }
  }, 5_000);

  /** Opens a URL as a tab in the main window (reopening the window if it was closed). */
  const openInMain = (url: string) => {
    const controller = windowManager.focused() ?? windowManager.all()[0];
    if (!controller) {
      windowManager.createMainWindow();
      setTimeout(() => windowManager.all()[0]?.tabs.create(url), 300);
      return;
    }
    controller.tabs.create(url);
    controller.win.show();
    controller.win.focus();
  };
  openLittle = (url: string | null) => {
    const little = new LittleWindow(url, {
      resolve: (input) => classifyInput(input)?.url ?? null,
      preloadPath: join(import.meta.dirname, '../preload/shell.cjs'),
      loadRenderer,
      register: (id) => senders.add(id, 'shell'),
      unregister: (id) => senders.remove(id),
      openInMain,
      send: (bar, state) => broadcaster.sendTo(bar, 'little:state', state),
    });
    const barId = little.win.webContents.id;
    littleWindows.set(barId, little);
    little.win.on('closed', () => littleWindows.delete(barId));
  };

  openExternal = (url: string) => {
    const rule = routeLink(settingsRepo.get('rules'), url);
    if (rule?.target === 'space' && rule.spaceId && store.space(rule.spaceId)) {
      const controller = windowManager.focused() ?? windowManager.all()[0];
      if (controller) {
        controller.tabs.switchSpace(rule.spaceId);
        controller.tabs.create(url);
        controller.win.show();
        controller.win.focus();
        return;
      }
    }
    if (rule?.target === 'current') {
      openInMain(url);
      return;
    }
    openLittle?.(url);
  };

  windowManager.createMainWindow();
  for (const url of pendingUrls.splice(0)) openExternal(url);
  // A PDF from this Mac opens in a tab of the front window (Chromium's PDF viewer).
  openPdfFile = (path) => {
    const controller = windowManager.focused() ?? windowManager.all()[0];
    if (!controller) return;
    try {
      controller.tabs.create(localPdfs.addressFor(path), { activate: true });
      controller.win.show();
      controller.win.focus();
    } catch (error) {
      toast(controller, error instanceof Error ? error.message : String(error));
    }
  };
  for (const path of pendingPdfs.splice(0)) openPdfFile(path);

  // Notes left empty last time go (unless a tab or floating note still shows them); floating
  // notes come back where they were.
  const savedFloating = settingsRepo.get('notes.floating');
  const shown = new Set(savedFloating.map((n) => n.id));
  for (const item of store.all()) {
    if (item.url?.startsWith('orbit://note/')) shown.add(item.url.slice('orbit://note/'.length));
  }
  notesRepo.pruneBlank(shown);
  floating.restore(savedFloating, (id) => notesRepo.get(id) !== null);
  focus.restore(); // a focus session left running keeps its timer
  applyLittleShortcut(persistence?.settings.get('little.globalShortcut') ?? false);
});
