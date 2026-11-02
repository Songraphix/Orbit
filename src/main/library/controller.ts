import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import type { Layout, LibraryPanel } from '@shared/types/layout';
import type { LibrarySection } from '@shared/types/library';

export type LibraryDeps = {
  win: BrowserWindow;
  getLayout: () => Layout;
  /** Makes room for the panel (the page moves right), or gives it back (null). */
  setPanel: (panel: LibraryPanel | null) => void;
  internalPreload: string;
  loadInternal: (view: WebContentsView, url: string) => void;
  registerInternal: (webContentsId: number) => void;
  unregisterInternal: (webContentsId: number) => void;
  onChange: (section: LibrarySection | null) => void;
};

/**
 * Library mode (F-11, Img 4, like Arc): the sidebar becomes the Library's sections and a panel
 * beside it shows orbit://library/<section> in its own internal view; the page moves right and
 * stays usable. Library pages never become tabs.
 */
export class LibraryController {
  private view: WebContentsView | null = null;
  private current: LibrarySection | null = null;

  constructor(private readonly deps: LibraryDeps) {}

  get section(): LibrarySection | null {
    return this.current;
  }

  /** True when this webContents is this window's Library page. */
  /** Where the Library sits in the window (for tooltips over it), or null. */
  get bounds(): { x: number; y: number; width: number; height: number } | null {
    return this.view ? this.view.getBounds() : null;
  }

  owns(webContentsId: number): boolean {
    return this.view !== null && this.view.webContents.id === webContentsId;
  }

  open(section: LibrarySection): void {
    const fresh = this.view === null;
    const view = this.view ?? this.createView();
    const changed = section !== this.current;
    this.current = section;
    // Spaces shows a column per space, so its panel is wide; the rest are a narrow list.
    this.deps.setPanel(section === 'spaces' ? 'wide' : 'narrow');
    if (fresh) {
      this.deps.loadInternal(view, `orbit://library/${section}`);
    } else if (changed) {
      // Switch sections inside the loaded page (no reload, so quick clicks can't cancel a load).
      // Electron runs this once the page has loaded. `section` is one of LIBRARY_SECTIONS.
      void view.webContents
        .executeJavaScript(`location.hash = ${JSON.stringify(`#/library/${section}`)}`)
        .catch(() => undefined);
    }
    this.fit();
    view.setVisible(true);
    view.webContents.focus();
    this.deps.onChange(section);
  }

  /** Back to the pages (the sidebar's back arrow, or any tab being opened). */
  close(): void {
    if (this.current === null) return;
    this.current = null;
    this.destroyView(); // reopening is quick, and a closed Library holds no memory
    this.deps.setPanel(null);
    this.deps.onChange(null);
  }

  /** Re-place the page after a layout change. */
  fit(): void {
    if (!this.view || this.current === null) return;
    const layout = this.deps.getLayout();
    if (!layout.library) return;
    this.view.setBounds(layout.library.panel);
    this.view.setBorderRadius(layout.radius);
  }

  destroy(): void {
    this.current = null;
    this.destroyView();
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
    // Transparent: the Library sits on the space's colours, which the shell draws behind it.
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

  private destroyView(): void {
    const view = this.view;
    if (!view) return;
    this.view = null;
    if (!this.deps.win.isDestroyed()) this.deps.win.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
