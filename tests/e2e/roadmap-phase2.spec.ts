import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

/**
 * The roadmap's Phase 2 acceptance (orbit_product_roadmap.md §5): "A user can research a
 * subject, save useful findings to a project, turn a finding into a task, and resume the work
 * from a saved workspace."
 */
type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}

test('Phase 2: research, save a finding to the project, make it a task, resume from the workspace', async () => {
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    // A project with its own workspace.
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('project-name').fill('Rebrand');
    await panel
      .getByTestId('project-space')
      .selectOption({ label: '+ New Space for this project' });
    await panel.getByTestId('form-save').click();
    await panel.getByTestId('project-card').filter({ hasText: 'Rebrand' }).click();
    await panel.getByTestId('open-workspace').click();
    await expect(win.getByTestId('space-name')).toHaveText('Rebrand');

    // Research: a page in the workspace; the useful part saved — to this project by default.
    await invoke(win, 'tabs:create', { url: server.url('/research') });
    const site = await pageWith(app, '/research');
    await site.evaluate(`(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('quote'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
    })()`);
    await clickMenu(app, 'capture');
    const bar = await pageWith(app, '/overlay/');
    await expect(bar.getByTestId('capture-project')).toHaveValue(/.+/);
    await expect(bar.getByTestId('capture-project').locator('option:checked')).toHaveText(
      'Rebrand',
    );
    await bar.getByTestId('capture-comment').fill('Adopt the 8 pt grid');
    await bar.getByTestId('capture-save').click();
    await expect(win.getByTestId('toolbar-toast')).toContainText('Saved to Rebrand');

    // The finding becomes a task.
    await expect(panel.getByTestId('project-research').getByTestId('research-row')).toHaveCount(1);
    await panel.getByTestId('project-research').getByTestId('more-menu').click();
    await panel.getByTestId('research-make-task').click();
    await panel.getByTestId('form-save').click();
    await expect(
      panel
        .getByTestId('project-tasks')
        .getByTestId('task-row')
        .filter({ hasText: 'Adopt the 8 pt grid' }),
    ).toHaveCount(1);
    await expect(panel.getByTestId('research-has-task')).toBeVisible();

    // Leave the workspace, then quit.
    await invoke(win, 'spaces:cycle', { direction: -1 });
    await expect(win.getByTestId('space-name')).not.toHaveText('Rebrand');
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData });
  try {
    const { app, win } = second;
    // Resume: the panel is back on the project; its workspace has the research page.
    const panel = await pageWith(app, '#/notes/panel');
    await expect(panel.getByTestId('project-title')).toHaveText('Rebrand');
    await expect(panel.getByTestId('project-research').getByTestId('research-label')).toHaveText([
      'Adopt the 8 pt grid',
    ]);
    await panel.getByTestId('open-workspace').click();
    await expect(win.getByTestId('space-name')).toHaveText('Rebrand');
    await expect(
      win.locator('[data-testid="tab-list"] [data-testid="tab-row"]', { hasText: 'Layout Basics' }),
    ).toHaveCount(1);
    // And ⌘T finds the finding.
    await invoke(win, 'commandbar:open', { mode: 'new' });
    const bar = await pageWith(app, '/overlay/');
    await bar.getByTestId('command-input').fill('8 pt grid');
    await expect(bar.locator('[data-testid="command-item"][data-kind="capture"]')).toContainText(
      'Research · Rebrand',
    );
  } finally {
    await second.close();
    await server.close();
  }
});
