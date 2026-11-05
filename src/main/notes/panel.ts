import { WebContentsView } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import type { Layout } from '@shared/types/layout';
import { notesHash } from './model';

export type NotesPanelDeps = {
  win: BrowserWindow;
  getLayout: () => Layout;
  /** Makes room on the right (the page narrows), or gives it back; wide for the board. */
  setOpen: (open: boolean, wide: boolean) => void;
  internalPreload: string;
  loadInternal: (target: { webContents: WebContents }, url: string) => void;
  registerInternal: (webContentsId: number) => void;
  unregisterInternal: (webContentsId: number) => void;
  /** Remembers whether it's open and where, so a restart brings it back. */
  persist?: (state: { open: boolean; route: string }) => void;
  /** It's opening: a docked app (App Hub) steps aside — the dock holds one at a time. */
  onOpen?: () => void;
};

/**
 * The Notes panel (F-33): a column docked on the right of the window showing orbit://notes/panel
 * (the notes list, or one note) in its own internal view. The page narrows and stays usable.
 * Closing only hides the view, so reopening is instant and an unsaved word is never lost.
 */
/** The panel's tabs (and the Project Board). */
export type PanelView = 'notes' | 'projects' | 'tasks' | 'board' | 'assistant' | 'tools';

export class NotesPanelController {
  private view: WebContentsView | null = null;
  private shown = false;
  private wide = false;
  /** Hidden while the dock's edge is dragged (native views swallow the pointer). */
  private suspended = false;
  /** Where the panel's page is: 'panel', 'panel/projects/<id>'… (checked by notesHash). */
  private route = 'panel';

  constructor(private readonly deps: NotesPanelDeps) {}

  get isOpen(): boolean {
    return this.shown;
  }

  /** The panel's page, once it has been opened (for events meant only for it). */
  get contents(): WebContents | null {
    const contents = this.view?.webContents;
    return contents && !contents.isDestroyed() ? contents : null;
  }

  /** Where the panel sits in the window (for tooltips over it), or null when hidden. */
  get bounds(): { x: number; y: number; width: number; height: number } | null {
    return this.view && this.shown ? this.view.getBounds() : null;
  }

  owns(webContentsId: number): boolean {
    return this.view !== null && this.view.webContents.id === webContentsId;
  }

  /** Opens the panel: on note `id`, on one of its tabs, or where it was (Notes, at first). */
  open(id?: string, tab?: PanelView): void {
    this.deps.onOpen?.();
    const fresh = this.view === null;
    const view = this.view ?? this.createView();
    // `id` was checked to be a UUID; `tab` is one of PanelView.
    const sub = id ? `/${id}` : tab && tab !== 'notes' ? `/${tab}` : tab === 'notes' ? '' : null;
    if (sub !== null) this.route = `panel${sub}`;
    if (fresh) this.deps.loadInternal(view, `orbit://notes/${this.route}`);
    else if (sub !== null) this.go(view, this.route);
    if (!this.shown) {
      this.shown = true;
      this.deps.setOpen(true, this.wide); // the layout tells the shell (its Notes button lights up)
      this.save();
    }
    this.fit();
    view.setVisible(true);
    view.webContents.focus();
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.wide = false;
    this.view?.setVisible(false);
    this.deps.setOpen(false, false);
    this.save();
  }

  /** Something changed elsewhere (a capture saved…): the panel's page reloads its data. */
  refresh(): void {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    void this.view.webContents
      .executeJavaScript(`window.dispatchEvent(new Event('orbit-work-changed'))`)
      .catch(() => undefined);
  }

  /** The page moved (a tab, a project, a note): remember it for the next launch. */
  setRoute(route: string): void {
    this.route = route;
    this.save();
  }

  /** Opens on a route ('panel/projects/<id>', 'panel/tasks'…); refused unless notesHash knows
   *  it. */
  openAt(route: string): void {
    if (notesHash(route) === '/not-found') return;
    this.route = route;
    if (this.view) this.go(this.view, route);
    this.open();
  }

  /** Shows `route` in the page: a hash change once it has loaded (no reload); while it's still
   *  loading (just opened, or restored at launch), a load at the new route — a hash set now
   *  would be lost when the first page arrives. */
  private go(view: WebContentsView, route: string): void {
    if (view.webContents.isLoading()) {
      this.deps.loadInternal(view, `orbit://notes/${route}`);
      return;
    }
    void view.webContents
      .executeJavaScript(`location.hash = ${JSON.stringify(`#/notes/${route}`)}`)
      .catch(() => undefined);
  }

  /** At launch: back where it was. `route` was checked by notesHash. */
  restore(route: string): void {
    this.route = route;
    this.open();
  }

  private save(): void {
    this.deps.persist?.({ open: this.shown, route: this.route });
  }

  /** The Project Board needs room: the panel widens while it shows. */
  setWide(wide: boolean): void {
    if (wide === this.wide) return;
    this.wide = wide;
    if (this.shown) this.deps.setOpen(true, wide);
  }

  toggle(): void {
    if (this.shown) this.close();
    else this.open();
  }

  /** The dock's edge is being dragged (true) or was let go (false). */
  suspend(on: boolean): void {
    this.suspended = on;
    if (on) this.view?.setVisible(false);
    else this.fit();
  }

  /** Re-place the panel after a layout change. */
  fit(): void {
    if (!this.view || !this.shown) return;
    const layout = this.deps.getLayout();
    if (!layout.notes || this.suspended) {
      this.view.setVisible(false); // e.g. a page went fullscreen
      return;
    }
    this.view.setBounds(layout.notes);
    this.view.setBorderRadius(layout.radius);
    this.view.setVisible(true);
  }

  destroy(): void {
    this.shown = false;
    const view = this.view;
    if (!view) return;
    this.view = null;
    if (!this.deps.win.isDestroyed()) this.deps.win.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  private createView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: this.deps.internalPreload,
      },
    });
    view.setBackgroundColor('#00000000');
    const contents = view.webContents;
    const id = contents.id;
    this.deps.registerInternal(id);
    contents.once('destroyed', () => this.deps.unregisterInternal(id));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.setVisible(false);
    this.deps.win.contentView.addChildView(view, 0); // below the overlay, like tabs
    this.view = view;
    return view;
  }
}
