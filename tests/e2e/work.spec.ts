import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );

async function panelPage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/notes/panel'))).toBe(true);
  return app.windows().find((p) => p.url().includes('#/notes/panel'))!;
}
/** The next "Delete …?" dialog answers with button `response`. */
const answerDialog = (app: ElectronApplication, response: number) =>
  app.evaluate(({ dialog }, r) => {
    dialog.showMessageBox = (async () => ({ response: r, checkboxChecked: false })) as never;
  }, response);
const tab = (panel: Page, id: string) =>
  panel.locator(`[data-testid="panel-tab"][data-tab="${id}"]`);
const filter = (panel: Page, group: string, id: string) =>
  panel.locator(`[data-testid="${group}"] [data-filter="${id}"]`);
const card = (panel: Page, name: string) =>
  panel.getByTestId('project-card').filter({ hasText: name });

test('projects: samples, filters with live counts, create, edit, status, delete', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    // The sidebar's Projects opens the panel on its Projects tab.
    await win.locator('[data-testid="workspace-item"][data-view="projects"]').click();
    const panel = await panelPage(app);
    await expect(tab(panel, 'projects')).toHaveAttribute('aria-current', 'page');
    await expect(panel.getByTestId('project-card-name')).toHaveText([
      'SIRATEQ Brand Guide',
      'KraitiveSon Content',
      'Wise Roots Academy',
      'Son Studio Website',
    ]);
    await expect(filter(panel, 'project-filters', 'all')).toContainText('4');
    await expect(filter(panel, 'project-filters', 'active')).toContainText('2');
    await expect(card(panel, 'SIRATEQ').getByTestId('project-percent')).toHaveText('80%');
    await expect(card(panel, 'Son Studio').getByTestId('project-complete')).toBeVisible();

    // Create: the name is required.
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('form-save').click();
    await expect(panel.getByTestId('form-error')).toContainText('name');
    await panel.getByTestId('project-name').fill('Launch Plan');
    await panel.getByTestId('project-description').fill('Q4 launch');
    await panel.locator('[data-testid="project-status"] [data-value="on-hold"]').click();
    await panel.getByTestId('form-save').click();
    await expect(panel.getByTestId('project-form')).toHaveCount(0);
    await expect(panel.getByTestId('work-toast')).toHaveText('Project created');
    await expect(filter(panel, 'project-filters', 'on-hold')).toContainText('2');
    await filter(panel, 'project-filters', 'on-hold').click();
    await expect(panel.getByTestId('project-card-name')).toHaveText([
      'Wise Roots Academy',
      'Launch Plan',
    ]);
    await expect(card(panel, 'Launch Plan').getByTestId('project-percent')).toHaveText('0%');

    // Edit, then change status from the menu.
    await card(panel, 'Launch Plan').getByTestId('more-menu').click();
    await panel.getByTestId('menu-edit').click();
    await panel.getByTestId('project-name').fill('Launch Plan 2');
    await panel.getByTestId('form-save').click();
    await expect(card(panel, 'Launch Plan 2')).toHaveCount(1);
    await card(panel, 'Launch Plan 2').getByTestId('more-menu').click();
    await panel.getByTestId('menu-status-active').click();
    await expect(filter(panel, 'project-filters', 'on-hold')).toContainText('1');
    await filter(panel, 'project-filters', 'all').click();

    // Delete asks first; Cancel keeps it.
    await answerDialog(app, 1); // a project with no tasks: [Delete, Cancel]
    await card(panel, 'Launch Plan 2').getByTestId('more-menu').click();
    await panel.getByTestId('menu-delete').click();
    await expect(card(panel, 'Launch Plan 2')).toHaveCount(1);
    await answerDialog(app, 0);
    await card(panel, 'Launch Plan 2').getByTestId('more-menu').click();
    await panel.getByTestId('menu-delete').click();
    await expect(card(panel, 'Launch Plan 2')).toHaveCount(0);
    await expect(filter(panel, 'project-filters', 'all')).toContainText('4');
  } finally {
    await orbit.close();
  }
});

test('tasks: in a project and globally, progress follows, filters, board, and it all persists', async () => {
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await panelPage(app);

    // A new project starts at 0% and offers to add a task.
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('project-name').fill('Garden');
    await panel.getByTestId('form-save').click();
    await card(panel, 'Garden').click();
    await expect(panel.getByTestId('project-title')).toHaveText('Garden');
    await expect(panel.getByTestId('detail-percent')).toHaveText('0%');
    await expect(panel.getByTestId('empty')).toContainText('No tasks in this project');

    // Tasks added here belong to the project; ticking them moves the progress.
    for (const title of ['Wireframes', 'Copy', 'Launch']) {
      await panel.getByTestId('project-add-task').click();
      await panel.getByTestId('task-title').fill(title);
      await panel.getByTestId('form-save').click();
      await expect(panel.getByTestId('task-form')).toHaveCount(0);
    }
    await expect(panel.getByTestId('stat-total')).toHaveText('3');
    const row = (t: string) => panel.getByTestId('task-row').filter({ hasText: t });
    await row('Wireframes').getByTestId('task-check').click();
    await expect(panel.getByTestId('detail-percent')).toHaveText('33%');
    await row('Copy').getByTestId('task-check').click();
    await row('Launch').getByTestId('task-check').click();
    await expect(panel.getByTestId('detail-percent')).toHaveText('100%');
    await row('Launch').getByTestId('task-check').click(); // reopened
    await expect(panel.getByTestId('detail-percent')).toHaveText('67%');
    await expect(panel.getByTestId('stat-remaining')).toHaveText('1');

    // Edit a task: due today, high priority.
    await row('Launch').getByTestId('task-open').click();
    const today = await panel.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await panel.getByTestId('task-due').fill(today);
    await panel.locator('[data-testid="task-priority"] [data-value="high"]').click();
    await panel.getByTestId('form-save').click();
    await expect(row('Launch').getByTestId('task-due-label')).toHaveText('Today');

    // Tasks tab: a global task (no project), and the filters.
    await tab(panel, 'tasks').click();
    await panel.getByTestId('new-task').click();
    await panel.getByTestId('task-title').fill('Call the bank');
    await panel.getByTestId('form-save').click();
    const tasks = panel.getByTestId('task-list').getByTestId('task-row');
    await expect(tasks.filter({ hasText: 'Call the bank' })).toHaveCount(1);
    await filter(panel, 'task-filters', 'today').click();
    await expect(tasks.filter({ hasText: 'Launch' })).toHaveCount(1);
    await expect(tasks.filter({ hasText: 'Call the bank' })).toHaveCount(0);
    await filter(panel, 'task-filters', 'completed').click();
    await expect(tasks.filter({ hasText: 'Wireframes' })).toHaveCount(1);

    // Delete a task (asks first).
    await filter(panel, 'task-filters', 'all').click();
    await answerDialog(app, 0);
    await tasks.filter({ hasText: 'Call the bank' }).hover();
    await tasks.filter({ hasText: 'Call the bank' }).getByTestId('task-remove').click();
    await expect(tasks.filter({ hasText: 'Call the bank' })).toHaveCount(0);

    // The board widens the panel; moving a card changes the task's status.
    await panel.getByTestId('qa-board').click();
    await expect
      .poll(
        async () => ((await invoke(win, 'layout:get')) as { notes: { width: number } }).notes.width,
      )
      .toBeGreaterThan(380);
    await panel.getByTestId('board-project').selectOption({ label: 'Garden' });
    const column = (s: string) =>
      panel.locator(`[data-testid="board-column"][data-status="${s}"]`).getByTestId('board-card');
    await expect(column('todo')).toHaveText([/Launch/]);
    await column('todo').first().getByTestId('more-menu').click();
    await panel.getByTestId('move-doing').click();
    await expect(column('doing')).toHaveText([/Launch/]);
    await panel.getByTestId('board-back').click();
    await expect
      .poll(
        async () => ((await invoke(win, 'layout:get')) as { notes: { width: number } }).notes.width,
      )
      .toBe(380);
  } finally {
    await first.close({ keepData: true });
  }

  // After a restart: the same projects and tasks, with their states.
  const second = await launchOrbit({ userData });
  try {
    await invoke(second.win, 'notes:panel', { view: 'projects' });
    const panel = await panelPage(second.app);
    await expect(card(panel, 'Garden').getByTestId('project-percent')).toHaveText('67%');
    await expect(panel.getByTestId('project-card')).toHaveCount(5); // samples not re-added
    // Deleting a project can keep its tasks (they move to "no project").
    await answerDialog(second.app, 1);
    await card(panel, 'Garden').getByTestId('more-menu').click();
    await panel.getByTestId('menu-delete').click();
    await expect(card(panel, 'Garden')).toHaveCount(0);
    await tab(panel, 'tasks').click();
    await expect(
      panel.getByTestId('task-list').getByTestId('task-row').filter({ hasText: 'Wireframes' }),
    ).toHaveCount(1);
  } finally {
    await second.close();
  }
});

test('quick actions and the Notes tab: notes still work beside projects', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await win.locator('[data-testid="workspace-item"][data-view="tasks"]').click();
    const panel = await panelPage(app);
    await expect(tab(panel, 'tasks')).toHaveAttribute('aria-current', 'page');
    await panel.getByTestId('qa-project').click();
    await expect(panel.getByTestId('project-form')).toBeVisible();
    await panel.keyboard.press('Escape');
    await panel.getByTestId('qa-task').click();
    await expect(panel.getByTestId('task-form')).toBeVisible();
    await panel.getByTestId('form-cancel').click();

    // New Note opens the existing editor; the Notes tab lists it.
    await panel.getByTestId('qa-note').click();
    await expect(panel.getByTestId('note-editor')).toBeVisible();
    await panel.getByTestId('note-editor').click();
    await panel.keyboard.type('Meeting notes');
    await panel.getByTestId('notes-back').click();
    await expect(tab(panel, 'notes')).toHaveAttribute('aria-current', 'page');
    await expect(panel.getByTestId('notes-item')).toContainText('Meeting notes');
    await panel.getByTestId('notes-close').click();
    await expect
      .poll(async () => ((await invoke(win, 'layout:get')) as { notes: unknown }).notes)
      .toBeNull();
  } finally {
    await orbit.close();
  }
});
