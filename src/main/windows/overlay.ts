import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import type {
  CommandBarMode,
  OverlayState,
  PeekView,
  Prompt,
  PromptAnswer,
} from '@shared/types/command-bar';
import type { SiteControlsView } from '@shared/types/site-controls';
import type { Rect } from '@shared/types/layout';
import { tipWidth, tooltipBox } from './tooltip';
import type { TooltipSide } from './tooltip';

export type OverlayDeps = {
  win: BrowserWindow;
  preloadPath: string;
  load: (view: WebContentsView) => void;
  register: (webContentsId: number) => void;
  unregister: (webContentsId: number) => void;
  send: (contents: Electron.WebContents, state: OverlayState) => void;
  /** Where keyboard focus goes back to when the overlay closes (the active tab). */
  refocus: () => void;
  /** A small copy of the page under the overlay, for glass surfaces to blur. */
  snapshot?: () => Promise<OverlayState['backdrop']>;
};

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type PendingPrompt = { prompt: Prompt; resolve: (answer: PromptAnswer) => void };

/**
 * The transparent, top-most view that hosts floating UI (ADR-006, PLAN.md section 4.5).
 * Web pages are native views above the shell, so anything that must float over a page lives
 * here: the command bar and site prompts (permissions, sign-in). Hidden whenever nothing is
 * open, so it never steals clicks.
 */
export class OverlayController {
  readonly view: WebContentsView;
  private commandBar: OverlayState['commandBar'] = null;
  private readonly prompts: PendingPrompt[] = [];
  private nextPromptId = 1;
  private peek: PeekView | null = null;
  private siteControls: SiteControlsView | null = null;
  private capture: OverlayState['capture'] = null;
  private colorPick: OverlayState['colorPick'] = null;
  private sidebarPeek: OverlayState['sidebarPeek'] = null;
  private createMenu: OverlayState['createMenu'] = null;
  private quickNote: OverlayState['quickNote'] = null;
  private profileMenu: OverlayState['profileMenu'] = null;
  private orbitMenu: OverlayState['orbitMenu'] = null;
  private appFloat: OverlayState['appFloat'] = null;
  private captureCard: OverlayState['captureCard'] = null;
  private shot: OverlayState['shot'] = null;
  private grouping: OverlayState['grouping'] = null;
  private appLibrary: OverlayState['appLibrary'] = null;
  private voicePopup: OverlayState['voicePopup'] = null;
  private tooltip: Omit<NonNullable<OverlayState['tooltip']>, 'alone'> | null = null;
  private flight: OverlayState['flight'] = null;
  private flightTimer: ReturnType<typeof setTimeout> | null = null;
  private backdrop: OverlayState['backdrop'] = null;
  private snapshotting = false;
  private wasBusy = false;
  /** Told when something other than the Peek (the command bar, a prompt…) comes up or goes:
   *  the Peek's page, which sits above the overlay, steps aside meanwhile. */
  onBusyChange: ((busy: boolean) => void) | null = null;

  constructor(private readonly deps: OverlayDeps) {
    this.view = new WebContentsView({
      webPreferences: {
        preload: deps.preloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.view.setBackgroundColor('#00000000');
    this.view.setVisible(false);
    // Added after the tabs (and tabs insert at index 0), so it stays on top.
    deps.win.contentView.addChildView(this.view);

    const contents = this.view.webContents;
    const id = contents.id;
    deps.register(id);
    contents.once('destroyed', () => deps.unregister(id));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    deps.load(this.view);
  }

  get current(): OverlayState {
    return {
      commandBar: this.commandBar,
      prompt: this.prompts[0]?.prompt ?? null,
      peek: this.peek,
      origin: this.onlyPeek
        ? { x: this.peek!.cover.x, y: this.peek!.cover.y }
        : this.onlyAppFloat
          ? { x: this.appFloat!.rect.x, y: this.appFloat!.rect.y }
          : { x: 0, y: 0 },
      siteControls: this.siteControls,
      capture: this.capture,
      colorPick: this.colorPick,
      sidebarPeek: this.sidebarPeek,
      createMenu: this.createMenu,
      quickNote: this.quickNote,
      profileMenu: this.profileMenu,
      orbitMenu: this.orbitMenu,
      appFloat: this.appFloat,
      captureCard: this.captureCard,
      shot: this.shot,
      grouping: this.grouping,
      appLibrary: this.appLibrary,
      voicePopup: this.voicePopup,
      tooltip: this.tooltip && { ...this.tooltip, alone: this.onlyTooltip },
      flight: this.flight,
      backdrop: this.backdrop,
    };
  }

  get isOpen(): boolean {
    return (
      this.commandBar !== null ||
      this.prompts.length > 0 ||
      this.peek !== null ||
      this.siteControls !== null ||
      this.capture !== null ||
      this.colorPick !== null ||
      this.createMenu !== null ||
      this.quickNote !== null ||
      this.profileMenu !== null ||
      this.orbitMenu !== null ||
      this.appFloat !== null ||
      this.captureCard !== null ||
      this.shot !== null ||
      this.grouping !== null ||
      this.appLibrary !== null ||
      this.voicePopup !== null ||
      this.flight !== null ||
      this.sidebarPeek !== null
    );
  }

  /** Something that needs the page area is showing — besides the Peek itself, the slid-out
   *  sidebar, tooltips and the download badge's flight. */
  private get othersOpenBesidesPeek(): boolean {
    return (
      this.commandBar !== null ||
      this.prompts.length > 0 ||
      this.siteControls !== null ||
      this.capture !== null ||
      this.colorPick !== null ||
      this.createMenu !== null ||
      this.quickNote !== null ||
      this.profileMenu !== null ||
      this.orbitMenu !== null ||
      this.appFloat !== null ||
      this.captureCard !== null ||
      this.shot !== null ||
      this.grouping !== null ||
      this.appLibrary !== null ||
      this.voicePopup !== null
    );
  }

  /** Only the Peek is showing: the overlay covers just the page area, so the sidebar stays
   *  usable (Arc). */
  private get onlyPeek(): boolean {
    return (
      this.peek !== null &&
      !this.othersOpenBesidesPeek &&
      this.flight === null &&
      this.sidebarPeek === null
    );
  }

  /** Only a tooltip is showing: the overlay is just its box (no clicks taken anywhere else). */
  private get onlyTooltip(): boolean {
    return this.tooltip !== null && !this.othersOpen && this.sidebarPeek === null;
  }

  /**
   * An Arc-style tooltip under (or over, or beside) a shell control. Shown without taking focus
   * or clicks: alone, the overlay shrinks to the tooltip's own box.
   */
  showTooltip(tip: { label: string; keys: string[]; anchor: Rect; side: TooltipSide }): void {
    // The Peek's page covers the window's middle, and the overlay just the page area (a
    // floating app's too).
    if (this.deps.win.isDestroyed() || this.peek !== null || this.appFloat !== null) return;
    const [width = 0, height = 0] = this.deps.win.getContentSize();
    const box = tooltipBox(tip.anchor, tip.side, tipWidth(tip.label, tip.keys), { width, height });
    this.tooltip = { label: tip.label, keys: tip.keys, box, side: tip.side, at: Date.now() };
    this.fit();
    this.view.setVisible(true);
    this.send();
  }

  hideTooltip(): void {
    if (!this.tooltip) return;
    this.tooltip = null;
    if (this.isOpen) this.fit();
    else this.view.setVisible(false);
    this.send();
  }

  /** Only a floating sidebar app is showing (with perhaps a tooltip). */
  private get onlyAppFloat(): boolean {
    return (
      this.appFloat !== null &&
      this.commandBar === null &&
      this.prompts.length === 0 &&
      this.peek === null &&
      this.siteControls === null &&
      this.capture === null &&
      this.colorPick === null &&
      this.createMenu === null &&
      this.quickNote === null &&
      this.profileMenu === null &&
      this.orbitMenu === null &&
      this.captureCard === null &&
      this.shot === null &&
      this.grouping === null &&
      this.appLibrary === null &&
      this.voicePopup === null &&
      this.flight === null &&
      this.sidebarPeek === null
    );
  }

  /** Only the slid-out sidebar is showing: the overlay covers just that strip, so the rest of
   *  the page keeps taking clicks. */
  private get onlySidebar(): boolean {
    return this.sidebarPeek !== null && !this.othersOpen;
  }

  private get othersOpen(): boolean {
    return this.othersOpenBesidesPeek || this.peek !== null || this.flight !== null;
  }

  get captureCardOpen(): boolean {
    return this.captureCard !== null;
  }

  /** The Capture card (roadmap P2.1); reopening it (after a screenshot) shows the new draft. */
  openCaptureCard(): void {
    this.siteControls = null;
    this.createMenu = null;
    this.profileMenu = null;
    this.commandBar = null;
    this.captureCard = { openedAt: Date.now() };
    this.show();
  }

  closeCaptureCard(): void {
    if (!this.captureCard) return;
    this.captureCard = null;
    this.sync();
  }

  /** The profile menu under the toolbar's avatar; the avatar toggles it. */
  toggleProfileMenu(anchor: Rect): void {
    if (this.profileMenu) {
      this.closeProfileMenu();
      return;
    }
    this.siteControls = null;
    this.createMenu = null;
    this.profileMenu = { anchor, openedAt: Date.now() };
    this.show();
  }

  /** A sidebar app floating over the page: its glass frame and header (the app's page sits on
   *  top of the overlay), and a backdrop where a click tucks it away. Null hides it. */
  setAppFloat(rect: Rect | null): void {
    const same =
      rect && this.appFloat && JSON.stringify(rect) === JSON.stringify(this.appFloat.rect);
    if (same || (!rect && !this.appFloat)) return;
    this.appFloat = rect ? { rect } : null;
    if (rect) this.show();
    else this.sync();
  }

  /** The Orbit menu under the toolbar's "Orbit ⌄"; the button toggles it. */
  toggleOrbitMenu(anchor: Rect): void {
    if (this.orbitMenu) {
      this.closeOrbitMenu();
      return;
    }
    this.siteControls = null;
    this.createMenu = null;
    this.profileMenu = null;
    this.orbitMenu = { anchor, openedAt: Date.now() };
    this.show();
  }

  closeOrbitMenu(): void {
    if (!this.orbitMenu) return;
    this.orbitMenu = null;
    this.sync();
  }

  closeProfileMenu(): void {
    if (!this.profileMenu) return;
    this.profileMenu = null;
    this.sync();
  }

  get quickNoteId(): string | null {
    return this.quickNote?.id ?? null;
  }

  /** The quick-note card (F-33) over the page, writing into note `id`. */
  openQuickNote(id: string): void {
    this.siteControls = null;
    this.createMenu = null;
    this.commandBar = null;
    this.quickNote = { id, openedAt: Date.now() };
    this.show();
  }

  /** Closes the quick note; returns the note it showed (null if none was open). */
  closeQuickNote(): string | null {
    const id = this.quickNote?.id ?? null;
    if (id === null) return null;
    this.quickNote = null;
    this.sync();
    return id;
  }

  /** Arc's download flourish: a badge flies from the page to the shelf (about a second). Keyboard
   *  focus stays where it is. */
  flyDownload(from: { x: number; y: number }, to: { x: number; y: number }): void {
    this.flight = { from, to, at: Date.now() };
    this.fit();
    this.view.setVisible(true);
    this.send();
    if (this.flightTimer) clearTimeout(this.flightTimer);
    this.flightTimer = setTimeout(() => {
      this.flightTimer = null;
      this.flight = null;
      if (this.isOpen || this.tooltip) {
        this.fit();
        this.send();
      } else {
        this.view.setVisible(false);
        this.send();
      }
    }, 950); // the overlay takes clicks while it shows, so the flight is kept short
  }

  /** The sidebar's + popover (Img 2); the button toggles it. */
  toggleCreateMenu(anchor: Rect): void {
    if (this.createMenu) {
      this.closeCreateMenu();
      return;
    }
    this.siteControls = null;
    this.createMenu = { anchor, openedAt: Date.now() };
    this.show();
  }

  closeCreateMenu(): void {
    if (!this.createMenu) return;
    this.createMenu = null;
    this.sync();
  }

  get sidebarPeekOpen(): boolean {
    return this.sidebarPeek !== null;
  }

  /** Slides the hidden sidebar out (`width`) or back in (null). Keyboard focus stays put. */
  setSidebarPeek(width: number | null): void {
    if (width === (this.sidebarPeek?.width ?? null)) return;
    this.sidebarPeek = width === null ? null : { width };
    if (width === null) {
      if (this.othersOpen || this.tooltip) this.fit();
      else this.view.setVisible(false);
    } else {
      this.fit();
      this.view.setVisible(true);
    }
    this.send();
  }

  /** Area screenshot: the overlay lets the user drag a rectangle over `area`. */
  startCapture(area: Rect): void {
    this.siteControls = null;
    this.capture = { area, openedAt: Date.now() };
    this.show();
  }

  endCapture(): void {
    if (!this.capture) return;
    this.capture = null;
    this.sync();
  }

  /** The screenshot card: a preview of the shot just taken and what to do with it. */
  showShot(shot: Omit<NonNullable<OverlayState['shot']>, 'at'>): void {
    this.siteControls = null;
    this.shot = { ...shot, at: Date.now() };
    this.show();
  }

  closeShot(): void {
    if (!this.shot) return;
    this.shot = null;
    this.sync();
  }

  /** Group Tabs: the proposed folders, to accept, rename, merge or leave out. */
  showGrouping(view: Omit<NonNullable<OverlayState['grouping']>, 'at'>): void {
    this.siteControls = null;
    this.grouping = { ...view, at: Date.now() };
    this.show();
  }

  closeGrouping(): void {
    if (!this.grouping) return;
    this.grouping = null;
    this.sync();
  }

  /** The voice popup: opened fresh (a new `at`), or updated as the answer arrives. */
  showVoicePopup(
    patch: Partial<Omit<NonNullable<OverlayState['voicePopup']>, 'at'>>,
    fresh = false,
  ): void {
    const base: NonNullable<OverlayState['voicePopup']> =
      fresh || !this.voicePopup
        ? {
            at: Date.now(),
            heard: null,
            answer: null,
            ai: false,
            speak: false,
            voice: null,
            quiet: false,
          }
        : this.voicePopup;
    this.voicePopup = { ...base, ...patch };
    if (fresh) this.siteControls = null;
    this.show();
  }

  closeVoicePopup(): void {
    if (!this.voicePopup) return;
    this.voicePopup = null;
    this.sync();
  }

  get isVoicePopupOpen(): boolean {
    return this.voicePopup !== null;
  }

  /** The App Library: your apps and the catalogue (a fresh view each time it changes). */
  showAppLibrary(view: Omit<NonNullable<OverlayState['appLibrary']>, 'at'>, keep = false): void {
    this.siteControls = null;
    this.appLibrary = { ...view, at: keep && this.appLibrary ? this.appLibrary.at : Date.now() };
    this.show();
  }

  closeAppLibrary(): void {
    if (!this.appLibrary) return;
    this.appLibrary = null;
    this.sync();
  }

  get isAppLibraryOpen(): boolean {
    return this.appLibrary !== null;
  }

  /** Pick Color: a still of the page (`image`) laid over its `area`, with a loupe. */
  startColorPick(area: Rect, image: string): void {
    this.siteControls = null;
    this.colorPick = { area, image, openedAt: Date.now() };
    this.show();
  }

  endColorPick(): void {
    if (!this.colorPick) return;
    this.colorPick = null;
    this.sync();
  }

  get colorPicking(): boolean {
    return this.colorPick !== null;
  }

  get siteControlsOpen(): boolean {
    return this.siteControls !== null;
  }

  /** Opens (or refreshes) the site controls popover (F-12). */
  showSiteControls(view: SiteControlsView): void {
    this.siteControls = view;
    this.show();
  }

  closeSiteControls(): void {
    if (!this.siteControls) return;
    this.siteControls = null;
    this.sync();
  }

  /** Shows/updates the Peek frame (null hides it). Focus stays with the Peek page. */
  setPeek(peek: PeekView | null): void {
    const opening = peek !== null && this.peek === null;
    this.peek = peek;
    if (!peek) {
      this.sync();
      return;
    }
    this.fit();
    if (opening) this.view.setVisible(true);
    this.send();
  }

  get mode(): CommandBarMode | null {
    return this.commandBar?.mode ?? null;
  }

  openCommandBar(mode: CommandBarMode, initialQuery = ''): void {
    this.commandBar = { mode, initialQuery, openedAt: Date.now() };
    this.show();
  }

  /** Closes the command bar (prompts stay until answered). */
  close(): void {
    if (!this.commandBar) return;
    this.commandBar = null;
    this.sync();
  }

  /** Asks the user something on a site's behalf; resolves with their answer. Queued. */
  ask(prompt: DistributiveOmit<Prompt, 'id'>): Promise<PromptAnswer> {
    const id = this.nextPromptId++;
    return new Promise((resolve) => {
      this.prompts.push({ prompt: { ...prompt, id } as Prompt, resolve });
      this.show();
    });
  }

  answer(answer: PromptAnswer): void {
    const index = this.prompts.findIndex((p) => p.prompt.id === answer.id);
    if (index === -1) return;
    const [pending] = this.prompts.splice(index, 1);
    pending!.resolve(answer);
    this.sync();
  }

  /** Keep covering the whole window while open (call on resize). */
  fit(): void {
    if (this.deps.win.isDestroyed()) return;
    const [width = 0, height = 0] = this.deps.win.getContentSize();
    if (this.onlyTooltip) {
      this.view.setBounds(this.tooltip!.box);
      return;
    }
    if (this.onlyPeek) {
      this.view.setBounds(this.peek!.cover);
      return;
    }
    if (this.onlyAppFloat) {
      // Just from the floating app to the window's edge: the rail, the sidebar and the toolbar
      // stay usable (another app in the rail switches to it), a click on the page tucks it away.
      const { x, y } = this.appFloat!.rect;
      this.view.setBounds({ x, y, width: Math.max(0, width - x), height: Math.max(0, height - y) });
      return;
    }
    // Room for the sidebar's shadow when it's the only thing showing (and its tooltips).
    const tipRight = this.tooltip ? this.tooltip.box.x + this.tooltip.box.width : 0;
    const strip = this.onlySidebar
      ? Math.min(width, Math.max(this.sidebarPeek!.width + 24, tipRight + 4))
      : width;
    this.view.setBounds({ x: 0, y: 0, width: strip, height });
  }

  destroy(): void {
    // Unanswered prompts are declined so the page isn't left waiting.
    for (const p of this.prompts.splice(0)) p.resolve({ id: p.prompt.id, allow: false });
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
  }

  private show(): void {
    this.fit();
    this.view.setVisible(true);
    this.view.webContents.focus();
    this.send();
    void this.refreshBackdrop();
  }

  /** Takes a fresh copy of the page for the glass to blur (the old one shows meanwhile). */
  private async refreshBackdrop(): Promise<void> {
    if (!this.deps.snapshot || this.snapshotting) return;
    this.snapshotting = true;
    try {
      const backdrop = await this.deps.snapshot();
      if (backdrop && this.isOpen) {
        this.backdrop = backdrop;
        this.send();
      }
    } catch {
      // No glass this time: the surfaces fall back to their solid tint.
    } finally {
      this.snapshotting = false;
    }
  }

  /** After something closed: hide if nothing is left, and send the new state. */
  private sync(): void {
    if (!this.isOpen) {
      // A tooltip may still be showing: the overlay shrinks to it, otherwise it hides.
      if (this.tooltip) this.fit();
      else this.view.setVisible(false);
      this.deps.refocus();
    } else {
      this.fit(); // e.g. back to just the slid-out sidebar
    }
    this.send();
  }

  private send(): void {
    if (!this.view.webContents.isDestroyed()) this.deps.send(this.view.webContents, this.current);
    // The slid-out sidebar too: the Peek's page would sit on top of it.
    const busy = this.othersOpenBesidesPeek || this.sidebarPeek !== null;
    if (busy !== this.wasBusy) {
      this.wasBusy = busy;
      this.onBusyChange?.(busy);
    }
  }
}
