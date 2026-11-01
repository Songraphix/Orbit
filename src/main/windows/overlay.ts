import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import type { CommandBarMode, OverlayState } from '@shared/types/command-bar';

export type OverlayDeps = {
  win: BrowserWindow;
  preloadPath: string;
  load: (view: WebContentsView) => void;
  register: (webContentsId: number) => void;
  unregister: (webContentsId: number) => void;
  send: (contents: Electron.WebContents, state: OverlayState) => void;
  /** Where keyboard focus goes back to when the overlay closes (the active tab). */
  refocus: () => void;
};

/**
 * The transparent, top-most view that hosts floating UI (ADR-006, PLAN.md section 4.5).
 * Web pages are native views above the shell, so anything that must float over a page lives
 * here. Hidden whenever nothing is open, so it never steals clicks.
 */
export class OverlayController {
  readonly view: WebContentsView;
  private state: OverlayState = { commandBar: null };

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
    return this.state;
  }

  get isOpen(): boolean {
    return this.state.commandBar !== null;
  }

  get mode(): CommandBarMode | null {
    return this.state.commandBar?.mode ?? null;
  }

  openCommandBar(mode: CommandBarMode, initialQuery = ''): void {
    this.setState({ commandBar: { mode, initialQuery, openedAt: Date.now() } });
    this.fit();
    this.view.setVisible(true);
    this.view.webContents.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.setState({ commandBar: null });
    this.view.setVisible(false);
    this.deps.refocus();
  }

  /** Keep covering the whole window while open (call on resize). */
  fit(): void {
    if (this.deps.win.isDestroyed()) return;
    const [width = 0, height = 0] = this.deps.win.getContentSize();
    this.view.setBounds({ x: 0, y: 0, width, height });
  }

  destroy(): void {
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
  }

  private setState(next: OverlayState): void {
    this.state = next;
    if (!this.view.webContents.isDestroyed()) this.deps.send(this.view.webContents, next);
  }
}
