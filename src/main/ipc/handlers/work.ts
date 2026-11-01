import { dialog } from 'electron';
import type { IpcRouter } from '../router';
import type { WorkData } from '@shared/work';
import type { NotesRepository } from '../../persistence/repositories/notes';
import type { WorkRepository } from '../../persistence/repositories/work';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/**
 * Projects and tasks (owner request). Only a window's productivity panel may call these; every
 * change answers with all the data so the panel's views stay in step. Deleting asks first.
 */
export function registerWorkHandlers(
  router: IpcRouter,
  windows: WindowManager,
  work: WorkRepository,
  notes: NotesRepository,
): void {
  const panelOf = (webContentsId: number) => {
    const window = windows.notesPanelFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} is not the productivity panel`);
    return window;
  };

  /** Everything the panel shows: projects (a deleted Space reads as none), tasks, the Spaces
   *  a project can use, and notes that belong to projects. */
  const everything = (window: WindowController): WorkData => {
    const spaces = window.store.spaces.map(({ id, name, icon }) => ({ id, name, icon }));
    const known = new Set(spaces.map((s) => s.id));
    const { projects, tasks } = work.all();
    return {
      projects: projects.map((p) =>
        p.spaceId && !known.has(p.spaceId) ? { ...p, spaceId: null } : p,
      ),
      tasks,
      spaces,
      notes: notes.linked(),
    };
  };

  router.handle('work:get', (_input, { sender }) => {
    const window = panelOf(sender.webContentsId);
    work.seedSamples(); // the first time ever, into an empty list only
    return everything(window);
  });

  router.handle('work:saveProject', ({ newSpace, ...input }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    let { spaceId } = input;
    if (newSpace && input.name.trim()) {
      // Its own workspace: a new Space named after it, in the current profile.
      spaceId = window.store.createSpace({
        name: input.name.trim().slice(0, 40),
        icon: 'briefcase',
        profileId: window.tabs.space.profileId,
      }).id;
    } else if (spaceId && !window.store.space(spaceId)) {
      spaceId = null;
    }
    const id = work.saveProject({ ...input, spaceId });
    return { id, data: everything(window) };
  });

  router.handle('work:projectStatus', ({ id, status }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    work.setProjectStatus(id, status);
    return everything(window);
  });

  /** Its page was opened; with `workspace`, the window also goes to the project's Space —
   *  where its tabs are, as they were left. */
  router.handle('work:openProject', ({ id, workspace }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const project = work.project(id);
    if (!project) return everything(window);
    work.markOpened(id);
    if (workspace && project.spaceId && window.store.space(project.spaceId)) {
      window.tabs.switchSpace(project.spaceId);
    }
    return everything(window);
  });

  router.handle('work:deleteProject', async ({ id }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const project = work.project(id);
    if (!project) return { deleted: false, data: everything(window) };
    const tasks = work.all().tasks.filter((t) => t.projectId === id).length;
    const notesLine = notes.linked().some((n) => n.projectId === id)
      ? ' Its notes stay in Notes.'
      : '';
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete “${project.name}”?`,
      detail:
        (tasks === 0
          ? 'The project has no tasks. This can’t be undone.'
          : `It has ${tasks === 1 ? '1 task' : `${tasks} tasks`}. Delete them with the project, ` +
            'or keep them in Tasks without a project. This can’t be undone.') +
        notesLine +
        (project.spaceId ? ' Its Space and tabs are kept.' : ''),
      buttons:
        tasks === 0 ? ['Delete', 'Cancel'] : ['Delete Project and Tasks', 'Keep Tasks', 'Cancel'],
      defaultId: tasks === 0 ? 1 : 2,
      cancelId: tasks === 0 ? 1 : 2,
    });
    const cancel = tasks === 0 ? 1 : 2;
    if (response === cancel) return { deleted: false, data: everything(window) };
    work.deleteProject(id, response === 1);
    notes.unlinkProject(id);
    return { deleted: true, data: everything(window) };
  });

  router.handle('work:saveTask', (input, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const id = work.saveTask(input);
    return { id, data: everything(window) };
  });

  router.handle('work:taskStatus', ({ id, status }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    work.setTaskStatus(id, status);
    return everything(window);
  });

  router.handle('work:deleteTask', async ({ id }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const task = work.task(id);
    if (!task) return { deleted: false, data: everything(window) };
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete the task “${task.title}”?`,
      detail: 'This can’t be undone.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { deleted: false, data: everything(window) };
    work.deleteTask(id);
    return { deleted: true, data: everything(window) };
  });

  router.handle('work:panelWide', ({ wide }, { sender }) => {
    panelOf(sender.webContentsId).notes.setWide(wide);
  });
}
