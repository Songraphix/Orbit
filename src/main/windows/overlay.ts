import { WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import type { CommandBarMode, OverlayState, Prompt, PromptAnswer } from '@shared/types/command-bar';

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
    return { commandBar: this.commandBar, prompt: this.prompts[0]?.prompt ?? null };
  }

  get isOpen(): boolean {
    return this.commandBar !== null || this.prompts.length > 0;
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
    this.view.setBounds({ x: 0, y: 0, width, height });
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
  }

  /** After something closed: hide if nothing is left, and send the new state. */
  private sync(): void {
    if (!this.isOpen) {
      this.view.setVisible(false);
      this.deps.refocus();
    }
    this.send();
  }

  private send(): void {
    if (!this.view.webContents.isDestroyed()) this.deps.send(this.view.webContents, this.current);
  }
}
