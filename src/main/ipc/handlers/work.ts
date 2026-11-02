import { clipboard, ClipboardItem, dialog, nativeImage } from 'electron';
import type { IpcRouter } from '../router';
import type { WorkData } from '@shared/work';
import type { CaptureRepository } from '../../persistence/repositories/captures';
import type { TemplateRepository } from '../../persistence/repositories/templates';
import type { ProjectTemplateRepository } from '../../persistence/repositories/project-templates';
import { addDays, tasksAsTemplate } from '@shared/project-templates';
import { dateKey } from '@shared/work';
import type { GithubService } from '../../github/service';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseTaskImport, tasksToCsv, tasksToMarkdown } from '@shared/task-transfer';
import { spaceFromTemplate } from '../../sidebar/templates';
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
  captures: CaptureRepository,
  templates: TemplateRepository,
  projectTemplates: ProjectTemplateRepository,
  github: GithubService,
): void {
  const panelOf = (webContentsId: number) => {
    const window = windows.notesPanelFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} is not the productivity panel`);
    return window;
  };

  /** Everything the panel shows: projects (a deleted Space reads as none), tasks, the Spaces
   *  a project can use, research (findings) and notes that belong to projects. */
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
      templates: templates.list().map(({ id, name }) => ({ id, name })),
      captures: captures.list(),
      notes: notes.linked(),
      projectTemplates: projectTemplates
        .list()
        .map(({ id, name, description, color, tasks, builtIn }) => ({
          id,
          name,
          description,
          color,
          tasks: tasks.length,
          builtIn,
        })),
    };
  };

  router.handle('work:get', (_input, { sender }) => {
    const window = panelOf(sender.webContentsId);
    work.seedSamples(); // the first time ever, into an empty list only
    return everything(window);
  });

  router.handle('work:saveProject', ({ newSpace, templateId, ...input }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    let { spaceId } = input;
    const fromTemplate =
      templateId && input.name.trim()
        ? spaceFromTemplate(window.store, templates, templateId, {
            profileId: window.tabs.space.profileId,
            name: input.name.trim(),
          })
        : null;
    if (fromTemplate) {
      // Its own workspace, started from a template: the template's tabs, icon and colours.
      spaceId = fromTemplate.id;
    } else if (newSpace && input.name.trim()) {
      // Its own workspace: a new Space named after it, in the current profile.
      spaceId = window.store.createSpace({
        name: input.name.trim().slice(0, 40),
        icon: 'briefcase',
        profileId: window.tabs.space.profileId,
      }).id;
    } else if (spaceId && !window.store.space(spaceId)) {
      spaceId = null;
    }
    const { projectTemplate, ...fields } = input;
    const id = work.saveProject({ ...fields, spaceId });
    // A new project from a template starts with its tasks, due relative to the start date.
    const template = !input.id && projectTemplate ? projectTemplates.get(projectTemplate) : null;
    if (template) {
      const start = input.startDate ?? dateKey(Date.now());
      for (const task of template.tasks) {
        work.saveTask({
          projectId: id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: 'todo',
          dueDate: task.dueIn === null ? null : addDays(start, task.dueIn),
        });
      }
    }
    return { id, data: everything(window) };
  });

  /** The project's GitHub repository: open pull requests and issues (roadmap P4.2). */
  router.handle('github:repo', async ({ projectId, refresh }, { sender }) => {
    panelOf(sender.webContentsId);
    const repo = work.project(projectId)?.githubRepo;
    return repo ? github.repo(repo, refresh === true) : null;
  });

  /** Export Tasks (roadmap P4.3): a project's tasks as CSV or a Markdown checklist. */
  router.handle('work:exportTasks', async ({ projectId, format }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const project = projectId ? work.project(projectId) : null;
    const name = project?.name ?? 'Tasks';
    const tasks = work.all().tasks.filter((t) => t.projectId === projectId);
    const { canceled, filePath } = await dialog.showSaveDialog(window.win, {
      title: 'Export Tasks',
      defaultPath: `${name.replace(/[/\\:]/g, '-')} tasks.${format}`,
      filters:
        format === 'csv'
          ? [{ name: 'CSV', extensions: ['csv'] }]
          : [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (canceled || !filePath) return { saved: false };
    const text = format === 'csv' ? tasksToCsv(tasks, name) : tasksToMarkdown(tasks, name);
    await writeFile(filePath, text, 'utf8');
    return { saved: true };
  });

  /** Import Tasks (roadmap P4.3): from another service's CSV, a checklist or a plain list. */
  router.handle('work:importTasks', async ({ projectId }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const { canceled, filePaths } = await dialog.showOpenDialog(window.win, {
      title: 'Import Tasks',
      properties: ['openFile'],
      filters: [{ name: 'Tasks', extensions: ['csv', 'md', 'markdown', 'txt'] }],
    });
    const file = filePaths[0];
    if (canceled || !file) return { imported: 0, data: everything(window) };
    const info = await stat(file);
    if (info.size > 2 * 1024 * 1024)
      throw new Error('That file is too large to import (2 MB at most)');
    const parsed = parseTaskImport(await readFile(file, 'utf8'), basename(file));
    const target = projectId && work.project(projectId) ? projectId : null;
    for (const task of parsed) work.saveTask({ ...task, projectId: target });
    return { imported: parsed.length, data: everything(window) };
  });

  /** Save as Template (roadmap P4.1): a project's tasks become a template for new projects. */
  router.handle('work:saveProjectTemplate', ({ projectId, name }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const project = work.project(projectId);
    if (!project) return everything(window);
    const start = project.startDate ?? dateKey(project.createdAt);
    const tasks = work.all().tasks.filter((t) => t.projectId === projectId);
    projectTemplates.create({
      name: name.trim() || project.name,
      description: project.description,
      color: project.color,
      tasks: tasksAsTemplate(tasks, start),
    });
    return everything(window);
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
    const researchLine = captures.list().some((c) => c.projectId === id)
      ? ' Its research moves to Unsorted.'
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
        researchLine +
        (project.spaceId ? ' Its Space and tabs are kept.' : ''),
      buttons:
        tasks === 0 ? ['Delete', 'Cancel'] : ['Delete Project and Tasks', 'Keep Tasks', 'Cancel'],
      defaultId: tasks === 0 ? 1 : 2,
      cancelId: tasks === 0 ? 1 : 2,
    });
    const cancel = tasks === 0 ? 1 : 2;
    if (response === cancel) return { deleted: false, data: everything(window) };
    // Tasks deleted with it free the findings they were made from.
    if (response === 0) {
      for (const t of work.all().tasks) if (t.projectId === id) captures.unlinkTask(t.id);
    }
    work.deleteProject(id, response === 1);
    notes.unlinkProject(id);
    captures.unlinkProject(id);
    return { deleted: true, data: everything(window) };
  });

  router.handle('work:saveTask', ({ captureId, ...input }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const id = work.saveTask(input);
    // Made from a finding (Research → Make Task): link them.
    if (captureId && captures.get(captureId)) captures.linkTask(captureId, id);
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
    captures.unlinkTask(id);
    return { deleted: true, data: everything(window) };
  });

  // Research (roadmap P2.1): findings saved with Orbit Capture.
  router.handle('research:image', ({ id, size }, { sender }) => {
    panelOf(sender.webContentsId);
    return { image: captures.image(id, size) };
  });

  router.handle('research:move', ({ id, projectId }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    captures.setProject(id, projectId && work.project(projectId) ? projectId : null);
    return everything(window);
  });

  router.handle('research:delete', async ({ id }, { sender }) => {
    const window = panelOf(sender.webContentsId);
    const capture = captures.get(id);
    if (!capture) return { deleted: false, data: everything(window) };
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: 'Delete this finding?',
      detail: (capture.taskId ? 'The task made from it stays. ' : '') + 'This can’t be undone.',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { deleted: false, data: everything(window) };
    captures.delete(id);
    return { deleted: true, data: everything(window) };
  });

  router.handle('research:copy', async ({ id }, { sender }) => {
    panelOf(sender.webContentsId);
    const capture = captures.get(id);
    if (!capture) return;
    const image = capture.hasImage ? captures.image(id, 'full') : null;
    if (image) {
      const bytes = nativeImage.createFromDataURL(image).toPNG();
      const png = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    } else {
      clipboard.writeText(capture.text || capture.url);
    }
  });

  router.handle('work:panelWide', ({ wide }, { sender }) => {
    panelOf(sender.webContentsId).notes.setWide(wide);
  });
}
