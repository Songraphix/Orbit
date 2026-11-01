import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

/**
 * The roadmap's Phase 1 acceptance (orbit_product_roadmap.md §5): "A user can open a project,
 * continue a previous session, capture a note, complete a task, close Orbit, and return without
 * losing context."
 */
type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
const tabTitles = (win: Page) =>
  win.locator('[data-testid="tab-list"] [data-testid="tab-row"]').allTextContents();

test('Phase 1: a project with its workspace, note and task survives closing Orbit', async () => {
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');

    // A project with its own workspace (a new Space).
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('project-name').fill('Client Site');
    await panel
      .getByTestId('project-space')
      .selectOption({ label: '+ New Space for this project' });
    await panel.getByTestId('form-save').click();
    await panel.getByTestId('project-card').filter({ hasText: 'Client Site' }).click();
    await expect(panel.getByTestId('project-workspace')).toContainText('Client Site');

    // Work in it: its Space gets the research tabs.
    await panel.getByTestId('open-workspace').click();
    await expect(win.getByTestId('space-name')).toHaveText('Client Site');
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await expect.poll(() => tabTitles(win)).toEqual(['Page Two', 'Page One']);

    // Capture a note in the project, and finish a task.
    await panel.getByTestId('project-new-note').click();
    await panel.getByTestId('note-editor').click();
    await panel.keyboard.type('Kickoff notes');
    await panel.keyboard.press('Enter');
    await panel.keyboard.type('Client wants a dark theme');
    await expect(panel.getByTestId('note-project')).toHaveValue(/.+/); // belongs to the project
    await panel.getByTestId('notes-back').click();
    await panel.locator('[data-testid="panel-tab"][data-tab="projects"]').click();
    await panel.getByTestId('project-card').filter({ hasText: 'Client Site' }).click();
    await expect(panel.getByTestId('project-note')).toHaveText([/Kickoff notes/]);
    for (const title of ['Moodboard', 'Homepage']) {
      await panel.getByTestId('project-add-task').click();
      await panel.getByTestId('task-title').fill(title);
      await panel.getByTestId('form-save').click();
      await expect(panel.getByTestId('task-form')).toHaveCount(0);
    }
    await panel
      .getByTestId('task-row')
      .filter({ hasText: 'Moodboard' })
      .getByTestId('task-check')
      .click();
    await expect(panel.getByTestId('detail-percent')).toHaveText('50%');

    // Leave: back to the first Space, then quit.
    await invoke(win, 'spaces:cycle', { direction: -1 });
    await expect(win.getByTestId('space-name')).not.toHaveText('Client Site');
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData });
  try {
    const { app, win } = second;
    // The panel is back where it was, on the project.
    const panel = await pageWith(app, '#/notes/panel');
    await expect(panel.getByTestId('project-title')).toHaveText('Client Site');
    await expect(panel.getByTestId('detail-percent')).toHaveText('50%');
    await expect(panel.getByTestId('project-note')).toHaveText([/Kickoff notes/]);

    // Projects offers to continue it, and its workspace has its tabs as they were.
    await panel.getByTestId('project-back').click();
    await expect(panel.getByTestId('continue-card')).toContainText('Client Site');
    await expect(panel.getByTestId('continue-card')).toContainText('Next: Homepage');
    await panel.getByTestId('continue-workspace').click();
    await expect(win.getByTestId('space-name')).toHaveText('Client Site');
    await expect.poll(() => tabTitles(win)).toEqual(['Page Two', 'Page One']);

    // ⌘T finds the note, and opens it in the panel.
    await invoke(win, 'commandbar:open', { mode: 'new' });
    const bar = await pageWith(app, '/overlay/');
    await bar.getByTestId('command-input').fill('dark theme');
    const note = bar.locator('[data-testid="command-item"][data-kind="note"]');
    await expect(note).toContainText('Kickoff notes');
    await note.click();
    await expect(panel.getByTestId('note-editor')).toContainText('Client wants a dark theme');
  } finally {
    await second.close();
    await server.close();
  }
});
