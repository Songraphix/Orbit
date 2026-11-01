import { BrowserWindow, screen } from 'electron';
import type { WebContents } from 'electron';
import type { Rect } from '@shared/types/layout';
import { floatBounds, FLOAT_SIZE, onScreen } from './model';

export type FloatingNote = { id: string; bounds: Rect; onTop: boolean };

export type FloatingNotesDeps = {
  internalPreload: string;
  loadInternal: (target: { webContents: WebContents }, url: string) => void;
  registerInternal: (webContentsId: number) => void;
  unregisterInternal: (webContentsId: number) => void;
  /** Saves which notes float where, so they come back next launch. */
  persist: (notes: FloatingNote[]) => void;
  /** A floating note was closed by the user (an empty one is then deleted). */
  onClosed: (id: string) => void;
};

type Entry = { win: BrowserWindow; onTop: boolean };

/**
 * Floating notes (F-33): a note in its own small window, like a sticky note. Kept above other
 * apps' windows while pinned ("Keep on Top", the default); remembered across launches.
 */
export class FloatingNotes {
  private readonly open = new Map<string, Entry>();
  private quitting = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: FloatingNotesDeps) {}

  /** Shows note `id` floating (focuses it if it already is). */
  show(id: string, saved?: { bounds: Rect; onTop: boolean }): void {
    const existing = this.open.get(id);
    if (existing) {
      existing.win.show();
      existing.win.focus();
      return;
    }
    const areas = screen.getAllDisplays().map((d) => d.workArea);
    const bounds =
      saved && onScreen(saved.bounds, areas)
        ? saved.bounds
        : floatBounds(
            screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
            this.open.size,
          );
    const onTop = saved?.onTop ?? true;
    const win = new BrowserWindow({
      ...bounds,
      minWidth: FLOAT_SIZE.min.width,
      minHeight: FLOAT_SIZE.min.height,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
      vibrancy: 'popover',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: this.deps.internalPreload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(onTop, 'floating');
    const contents = win.webContents;
    const contentsId = contents.id;
    this.deps.registerInternal(contentsId);
    contents.once('destroyed', () => this.deps.unregisterInternal(contentsId));
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.open.set(id, { win, onTop });
    win.on('moved', () => this.scheduleSave());
    win.on('resized', () => this.scheduleSave());
    win.on('closed', () => {
      this.open.delete(id);
      if (this.quitting) return; // still open next launch
      this.save();
      this.deps.onClosed(id);
    });
    win.once('ready-to-show', () => win.show());
    this.deps.loadInternal(win, `orbit://notes/float/${id}`);
    this.save();
  }

  /** The floating note whose page is this webContents. */
  noteFor(webContentsId: number): string | null {
    for (const [id, entry] of this.open) {
      if (!entry.win.isDestroyed() && entry.win.webContents.id === webContentsId) return id;
    }
    return null;
  }

  windowFor(id: string): BrowserWindow | null {
    return this.open.get(id)?.win ?? null;
  }

  isOnTop(id: string): boolean {
    return this.open.get(id)?.onTop ?? false;
  }

  setOnTop(id: string, onTop: boolean): void {
    const entry = this.open.get(id);
    if (!entry) return;
    entry.onTop = onTop;
    entry.win.setAlwaysOnTop(onTop, 'floating');
    this.save();
  }

  close(id: string): void {
    this.open.get(id)?.win.close();
  }

  /** Brings back last session's floating notes (ones that still exist). */
  restore(saved: readonly FloatingNote[], exists: (id: string) => boolean): void {
    for (const note of saved) if (exists(note.id)) this.show(note.id, note);
  }

  /** App quitting: the windows close, but stay remembered. */
  willQuit(): void {
    this.flush();
    this.quitting = true;
  }

  ids(): string[] {
    return [...this.open.keys()];
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 400);
  }

  private flush(): void {
    if (this.saveTimer) this.save();
  }

  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const notes: FloatingNote[] = [];
    for (const [id, { win, onTop }] of this.open) {
      if (!win.isDestroyed()) notes.push({ id, bounds: win.getBounds(), onTop });
    }
    this.deps.persist(notes);
  }
}
