import { WebContentsView } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import type { Layout } from '@shared/types/layout';

export type NotesPanelDeps = {
  win: BrowserWindow;
  getLayout: () => Layout;
  /** Makes room on the right (the page narrows), or gives it back. */
  setOpen: (open: boolean) => void;
  internalPreload: string;
  loadInternal: (target: { webContents: WebContents }, url: string) => void;
  registerInternal: (webContentsId: number) => void;
  unregisterInternal: (webContentsId: number) => void;
};

/**
 * The Notes panel (F-33): a column docked on the right of the window showing orbit://notes/panel
 * (the notes list, or one note) in its own internal view. The page narrows and stays usable.
 * Closing only hides the view, so reopening is instant and an unsaved word is never lost.
 */
export class NotesPanelController {
  private view: WebContentsView | null = null;
  private shown = false;

  constructor(private readonly deps: NotesPanelDeps) {}

  get isOpen(): boolean {
    return this.shown;
  }

  owns(webContentsId: number): boolean {
    return this.view !== null && this.view.webContents.id === webContentsId;
  }

  /** Opens the panel: on note `id`, or where it was (the list, the first time). */
  open(id?: string): void {
    const fresh = this.view === null;
    const view = this.view ?? this.createView();
    const path = id ? `orbit://notes/panel/${id}` : 'orbit://notes/panel';
    if (fresh) this.deps.loadInternal(view, path);
    else if (id) {
      // Switch notes inside the loaded page (no reload). `id` was checked to be a UUID.
      void view.webContents
        .executeJavaScript(`location.hash = ${JSON.stringify(`#/notes/panel/${id}`)}`)
        .catch(() => undefined);
    }
    if (!this.shown) {
      this.shown = true;
      this.deps.setOpen(true); // the layout tells the shell (its Notes button lights up)
    }
    this.fit();
    view.setVisible(true);
    view.webContents.focus();
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.view?.setVisible(false);
    this.deps.setOpen(false);
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
