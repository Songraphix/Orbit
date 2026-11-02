import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

/**
 * Roadmap Phase 4 acceptance: "Users can adapt Orbit to their workflows, and integrations
 * provide clear value without hurting reliability or performance" — a project from a template
 * that follows its GitHub repository, a rule for links from other apps, and both still there
 * (and quick to come back) after a restart.
 */
type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
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

test('Phase 4: a templated project on GitHub and a link rule, kept across a restart', async () => {
  const server = await startTestServer();
  const env = { ORBIT_GITHUB_API_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' };
  const first = await launchOrbit({ env });
  const { userData } = first;
  try {
    const { app, win } = first;
    // Adapt: a Research project from its template, following acme/site, with its own Space.
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel/projects');
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('project-name').fill('Market Study');
    await panel.getByTestId('project-template').selectOption('builtin:research');
    await panel.getByTestId('project-github').fill('acme/site');
    await panel
      .getByTestId('project-space')
      .selectOption({ label: '+ New Space for this project' });
    await panel.getByTestId('form-save').click();
    await panel.getByTestId('project-card').filter({ hasText: 'Market Study' }).click();
    await expect(panel.getByTestId('stat-total')).toHaveText('5');
    await expect(panel.getByTestId('project-github').getByTestId('github-item')).toHaveCount(2);

    // A rule: links to 127.0.0.1 from other apps open in the project's Space.
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="rules"]').click();
    await settings.getByTestId('rule-pattern').fill('127.0.0.1');
    await settings.getByTestId('rule-target').selectOption({ label: 'in Market Study' });
    await settings.getByTestId('rule-add').click();
    await expect(settings.getByTestId('rule-text')).toHaveText([
      'Links to 127.0.0.1 open in Market Study',
    ]);
  } finally {
    await first.close({ keepData: true });
  }

  // After a restart (and quickly): the project, its tasks and repository, and the rule work.
  const started = Date.now();
  const second = await launchOrbit({ userData, env });
  const startup = Date.now() - started;
  try {
    const { app, win } = second;
    expect(startup).toBeLessThan(15_000);
    await app.evaluate(({ app: electronApp }, url) => {
      electronApp.emit('open-url', { preventDefault: () => undefined }, url);
    }, server.url('/one'));
    await expect(win.getByTestId('space-name')).toHaveText('Market Study');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('project-card').filter({ hasText: 'Market Study' }).click();
    await expect(panel.getByTestId('stat-total')).toHaveText('5');
    await expect(panel.getByTestId('project-github')).toContainText('acme/site');
  } finally {
    await second.close();
    await server.close();
  }
});
