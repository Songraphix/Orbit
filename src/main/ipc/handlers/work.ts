import { dialog } from 'electron';
import type { IpcRouter } from '../router';
import type { WorkRepository } from '../../persistence/repositories/work';
import type { WindowManager } from '../../windows/window-manager';

/**
 * Projects and tasks (owner request). Only a window's productivity panel may call these; every
 * change answers with all the data so the panel's views stay in step. Deleting asks first.
 */
export function registerWorkHandlers(
  router: IpcRouter,
  windows: WindowManager,
  work: WorkRepository,
): void {
  const panelOf = (webContentsId: number) => {
    const window = windows.notesPanelFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} is not the productivity panel`);
    return window;
  };

  router.handle('work:get', (_input, { sender }) => {
    panelOf(sender.webContentsId);
    work.seedSamples(); // the first time ever, into an empty list only
    return work.all();
  });

  router.handle('work:saveProject', (input, { sender }) => {
    panelOf(sender.webContentsId);
    const id = work.saveProject(input);
    return { id, data: work.all() };
  });

  router.handle('work:projectStatus', ({ id, status }, { sender }) => {
    panelOf(sender.webContentsId);
    work.setProjectStatus(id, status);
    return work.all();
  });

  router.handle('work:deleteProject', async ({ id }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const project = work.project(id);
    if (!project) return { deleted: false, data: work.all() };
    const tasks = work.all().tasks.filter((t) => t.projectId === id).length;
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete “${project.name}”?`,
      detail:
        tasks === 0
          ? 'The project has no tasks. This can’t be undone.'
          : `It has ${tasks === 1 ? '1 task' : `${tasks} tasks`}. Delete them with the project, ` +
            'or keep them in Tasks without a project. This can’t be undone.',
      buttons:
        tasks === 0 ? ['Delete', 'Cancel'] : ['Delete Project and Tasks', 'Keep Tasks', 'Cancel'],
      defaultId: tasks === 0 ? 1 : 2,
      cancelId: tasks === 0 ? 1 : 2,
    });
    const cancel = tasks === 0 ? 1 : 2;
    if (response === cancel) return { deleted: false, data: work.all() };
    work.deleteProject(id, response === 1);
    return { deleted: true, data: work.all() };
  });

  router.handle('work:saveTask', (input, { sender }) => {
    panelOf(sender.webContentsId);
    const id = work.saveTask(input);
    return { id, data: work.all() };
  });

  router.handle('work:taskStatus', ({ id, status }, { sender }) => {
    panelOf(sender.webContentsId);
    work.setTaskStatus(id, status);
    return work.all();
  });

  router.handle('work:deleteTask', async ({ id }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const task = work.task(id);
    if (!task) return { deleted: false, data: work.all() };
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete the task “${task.title}”?`,
      detail: 'This can’t be undone.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { deleted: false, data: work.all() };
    work.deleteTask(id);
    return { deleted: true, data: work.all() };
  });

  router.handle('work:panelWide', ({ wide }, { sender }) => {
    panelOf(sender.webContentsId).notes.setWide(wide);
  });
}
