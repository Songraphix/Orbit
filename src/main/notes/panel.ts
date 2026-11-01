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
};

/**
 * The Notes panel (F-33): a column docked on the right of the window showing orbit://notes/panel
 * (the notes list, or one note) in its own internal view. The page narrows and stays usable.
 * Closing only hides the view, so reopening is instant and an unsaved word is never lost.
 */
/** The panel's tabs (and the Project Board). */
export type PanelView = 'notes' | 'projects' | 'tasks' | 'board';

export class NotesPanelController {
  private view: WebContentsView | null = null;
  private shown = false;
  private wide = false;
  /** Where the panel's page is: 'panel', 'panel/projects/<id>'… (checked by notesHash). */
  private route = 'panel';

  constructor(private readonly deps: NotesPanelDeps) {}

  get isOpen(): boolean {
    return this.shown;
  }

  owns(webContentsId: number): boolean {
    return this.view !== null && this.view.webContents.id === webContentsId;
  }

  /** Opens the panel: on note `id`, on one of its tabs, or where it was (Notes, at first). */
  open(id?: string, tab?: PanelView): void {
    const fresh = this.view === null;
    const view = this.view ?? this.createView();
    // `id` was checked to be a UUID; `tab` is one of PanelView.
    const sub = id ? `/${id}` : tab && tab !== 'notes' ? `/${tab}` : tab === 'notes' ? '' : null;
    if (sub !== null) this.route = `panel${sub}`;
    if (fresh) this.deps.loadInternal(view, `orbit://notes/${this.route}`);
    else if (sub !== null) {
      // Switch inside the loaded page (no reload).
      void view.webContents
        .executeJavaScript(`location.hash = ${JSON.stringify(`#/notes/panel${sub}`)}`)
        .catch(() => undefined);
    }
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
    if (this.view) {
      void this.view.webContents
        .executeJavaScript(`location.hash = ${JSON.stringify(`#/notes/${route}`)}`)
        .catch(() => undefined);
    }
    this.open();
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

  /** Re-place the panel after a layout change. */
  fit(): void {
    if (!this.view || !this.shown) return;
    const layout = this.deps.getLayout();
    if (!layout.notes) {
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
