import { NEW_TAB_URL } from '@shared/types/tabs';
import { BrowserWindow, dialog } from 'electron';
import type { NoteSurfaceKind } from '@shared/types/notes';
import type { IpcRouter } from '../router';
import type { FloatingNotes } from '../../notes/floating';
import { notesHash } from '../../notes/model';
import type { NotesRepository } from '../../persistence/repositories/notes';
import type { WindowController, WindowManager } from '../../windows/window-manager';

export const noteUrl = (id: string) => `orbit://note/${id}`;

/** Opens note `id` as a tab in the window (switches to it if a tab already shows it). */
export function openNoteTab(controller: WindowController, id: string): void {
  const url = noteUrl(id);
  const existing = controller.tabs.snapshot().tabs.find((tab) => tab.url === url);
  if (existing) controller.tabs.activate(existing.id);
  else controller.tabs.create(url);
}

/** A new note in a tab ("New Note" in the + menu, the command bar). */
export function newNoteTab(notes: NotesRepository, controller: WindowController): void {
  openNoteTab(controller, notes.create());
}

/** A new note in the quick-note card over the page (⌃⇧N). Pressed again, it closes. */
export function toggleQuickNote(notes: NotesRepository, controller: WindowController): void {
  if (controller.overlay.quickNoteId) {
    closeQuickNote(controller);
    return;
  }
  controller.peek.close();
  controller.overlay.openQuickNote(notes.create());
}

/** Closes the quick-note card. Its editor saves, and drops the note if it stayed empty, as it
 *  goes (deleting here could beat its last save). */
export function closeQuickNote(controller: WindowController): void {
  controller.overlay.closeQuickNote();
}

const isWeb = (url: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

/**
 * Notes (F-33). The same editor runs in four places — a note's tab, the Notes panel, a floating
 * note window and the quick-note card — and every call is checked to come from one of them.
 */
export function registerNotesHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: { notes: NotesRepository; floating: FloatingNotes },
): void {
  const { notes, floating } = deps;

  /** Where the sender is, and the window it acts in (a floating note uses the front window). */
  const surfaceOf = (
    webContentsId: number,
  ): { kind: NoteSurfaceKind; window: WindowController | null; floatId?: string } => {
    const tab = windows.tabForContents(webContentsId);
    if (tab && tab.tab.state.url.startsWith('orbit://note/')) {
      return { kind: 'tab', window: tab.window };
    }
    const panel = windows.notesPanelFor(webContentsId);
    if (panel) return { kind: 'panel', window: panel };
    const floatId = floating.noteFor(webContentsId);
    if (floatId) return { kind: 'float', window: windows.focused() ?? null, floatId };
    const owner = windows.forSender(webContentsId);
    if (owner && owner.overlay.view.webContents.id === webContentsId) {
      return { kind: 'quick', window: owner };
    }
    throw new Error(`Sender ${webContentsId} is not a notes page`);
  };

  router.handle('notes:list', ({ query }, { sender }) => {
    surfaceOf(sender.webContentsId);
    return { notes: notes.list(query?.trim() ?? '') };
  });

  router.handle('notes:get', ({ id }, { sender }) => {
    surfaceOf(sender.webContentsId);
    const note = notes.get(id);
    return note
      ? { id: note.id, doc: note.doc, updatedAt: note.updatedAt, projectId: note.projectId }
      : null;
  });

  router.handle('notes:create', ({ projectId }, { sender }) => {
    surfaceOf(sender.webContentsId);
    return { id: notes.create(Date.now(), projectId ?? null) };
  });

  router.handle('notes:setProject', ({ id, projectId }, { sender }) => {
    if (surfaceOf(sender.webContentsId).kind === 'quick') throw new Error('Not from here');
    notes.setProject(id, projectId);
  });

  router.handle('notes:save', ({ id, doc, text }, { sender }) => {
    surfaceOf(sender.webContentsId);
    return { updatedAt: notes.save(id, doc, text) };
  });

  router.handle('notes:version', ({ id }, { sender }) => {
    surfaceOf(sender.webContentsId);
    return { updatedAt: notes.get(id)?.updatedAt ?? null };
  });

  router.handle('notes:discardIfBlank', ({ id }, { sender }) => {
    surfaceOf(sender.webContentsId);
    // A note still showing somewhere else (a tab, a floating window) stays.
    const elsewhere =
      floating.windowFor(id) !== null ||
      windows.all().some((c) => c.tabs.snapshot().tabs.some((t) => t.url === noteUrl(id)));
    return { deleted: !elsewhere && notes.deleteIfBlank(id) };
  });

  router.handle('notes:act', async ({ id, action }, { sender }) => {
    const from = surfaceOf(sender.webContentsId);
    if (!notes.get(id)) return { done: false };
    const window = from.window;
    // Moving out of the quick-note card closes it (the note itself stays).
    const leaveQuick = () => {
      if (from.kind === 'quick' && window) window.overlay.closeQuickNote();
    };

    if (action === 'delete') {
      const parent =
        (from.floatId && floating.windowFor(from.floatId)) ||
        window?.win ||
        BrowserWindow.getFocusedWindow();
      const options = {
        type: 'warning' as const,
        message: `Delete “${notes.title(id)}”?`,
        detail: 'The note is deleted from this Mac.',
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      };
      const { response } = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options);
      if (response !== 0) return { done: false };
      notes.delete(id);
      floating.close(id);
      for (const controller of windows.all()) {
        if (controller.overlay.quickNoteId === id) controller.overlay.closeQuickNote();
        for (const tab of controller.tabs.snapshot().tabs) {
          if (tab.url === noteUrl(id)) controller.tabs.close(tab.id);
        }
      }
      return { done: true };
    }

    if (action === 'float') {
      leaveQuick();
      floating.show(id);
      return { done: true };
    }

    if (!window) return { done: false }; // no Orbit window open to show it in
    leaveQuick();
    if (from.kind === 'float') floating.close(id); // it moves into the window
    if (action === 'panel') window.notes.open(id);
    else openNoteTab(window, id);
    window.win.show();
    window.win.focus();
    return { done: true };
  });

  router.handle('notes:openUrl', ({ url }, { sender }) => {
    const { window } = surfaceOf(sender.webContentsId);
    // Web pages, or Settings (the assistant's "Open Settings → AI").
    if (!window || !(isWeb(url) || /^orbit:\/\/settings(\/[a-z]+)?$/.test(url))) return;
    window.tabs.create(url);
    window.win.focus();
  });

  router.handle('notes:panel', ({ open, id, view, projectId }, { sender }) => {
    // The new tab page's Today list opens the panel's Tasks too.
    const newTab = windows.tabForContents(sender.webContentsId);
    const window =
      windows.forSender(sender.webContentsId) ??
      surfaceOf(sender.webContentsId).window ??
      (newTab?.tab.state.url === NEW_TAB_URL ? newTab.window : null);
    if (!window) return;
    if (projectId) window.notes.openAt(`panel/projects/${projectId}`);
    else if (id || view || open === true) window.notes.open(id, view);
    else if (open === false) window.notes.close();
    else window.notes.toggle();
  });

  router.handle('notes:panelRoute', ({ route }, { sender }) => {
    const window = windows.notesPanelFor(sender.webContentsId);
    if (!window) throw new Error(`Sender ${sender.webContentsId} is not the panel`);
    if (notesHash(route) !== '/not-found') window.notes.setRoute(route);
  });

  router.handle('notes:quick', ({ open }, { sender }) => {
    const window = windows.forSender(sender.webContentsId);
    if (!window) return;
    if (open && !window.overlay.quickNoteId) toggleQuickNote(notes, window);
    else if (!open) closeQuickNote(window);
  });

  router.handle('notes:onTop', ({ onTop }, { sender }) => {
    const { floatId } = surfaceOf(sender.webContentsId);
    if (!floatId) throw new Error('Only a floating note can stay on top');
    if (onTop !== undefined) floating.setOnTop(floatId, onTop);
    return { onTop: floating.isOnTop(floatId) };
  });
}
