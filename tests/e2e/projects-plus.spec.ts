import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import type { Orbit } from './launch-orbit';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

let orbit: Orbit;
let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer();
  orbit = await launchOrbit({
    env: { ORBIT_GITHUB_API_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' },
  });
});
test.afterEach(async () => {
  await orbit?.close();
  await server?.close();
});

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

test('a project from a template follows its GitHub repo; its pull requests become tasks', async () => {
  const { app, win } = orbit;
  await invoke(win, 'notes:panel', { view: 'projects' });
  const panel = await pageWith(app, '#/notes/panel/projects');

  // A new project from the Development template, following acme/site.
  await panel.getByTestId('new-project').click();
  await panel.getByTestId('project-name').fill('Launch site');
  await panel.getByTestId('project-template').selectOption('builtin:development');
  await expect(panel.getByTestId('project-description')).toHaveValue(
    'Plan, build, review and ship.',
  );
  await panel.getByTestId('project-github').fill('https://github.com/acme/site');
  await panel.getByTestId('form-save').click();
  await panel.getByTestId('project-card').filter({ hasText: 'Launch site' }).click();
  await expect(panel.getByTestId('stat-total')).toHaveText('7');
  await expect(panel.getByTestId('project-tasks').getByTestId('task-row').first()).toContainText(
    'Set up the repository',
  );

  // Its open pull requests and issues (the issues list leaves pull requests out).
  const github = panel.getByTestId('project-github');
  await expect(github).toContainText('acme/site');
  await expect(github.getByTestId('github-item')).toHaveCount(2);
  await expect(github.getByTestId('github-item').first()).toContainText('#7 Add dark mode');
  await github.locator('[data-testid="github-tab"][data-kind="issue"]').click();
  await expect(github.getByTestId('github-item')).toHaveCount(1);
  await expect(github.getByTestId('github-item')).toContainText('Footer overlaps on mobile');
  expect(server.lastGithubAuth()).toBe(''); // a public repository: no token needed

  // An issue becomes a task, linked back to GitHub.
  await github.getByTestId('github-item').hover();
  await github.getByTestId('github-make-task').click();
  await expect(panel.getByTestId('task-title')).toHaveValue('#9 Footer overlaps on mobile');
  await panel.getByTestId('form-save').click();
  await expect(panel.getByTestId('stat-total')).toHaveText('8');

  // Save as Template: new projects can start with these eight tasks.
  await panel.getByTestId('project-detail').getByTestId('more-menu').first().click();
  await panel.getByTestId('menu-save-template').click();
  await panel.getByTestId('template-name').fill('Site launch');
  await panel.getByTestId('template-save').click();
  await expect(panel.getByTestId('work-toast')).toHaveText('Template saved');
  await panel.getByTestId('project-back').click();
  await panel.getByTestId('new-project').click();
  await expect(panel.getByTestId('project-template').locator('option')).toContainText([
    'Site launch · 8 tasks',
  ]);
  await panel.keyboard.press('Escape');

  // Settings: your template (renamable, deletable) beside the built-in ones; a GitHub token.
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="workspaces"]').click();
  const rows = settings.getByTestId('project-template-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.last().getByTestId('project-template-name')).toHaveValue('Site launch');
  await settings.locator('[data-testid="settings-nav"][data-section="integrations"]').click();
  await settings.getByTestId('github-token').fill('not-a-token');
  await settings.getByTestId('github-token-save').click();
  await expect(settings.getByTestId('github-token-error')).toContainText('doesn’t look like');
  const token = `github_pat_${'a'.repeat(40)}`;
  await settings.getByTestId('github-token').fill(token);
  await settings.getByTestId('github-token-save').click();
  await expect(settings.getByTestId('github-token-remove')).toBeVisible();

  // With a token, GitHub requests carry it.
  await closeSettings(app);
  await panel.getByTestId('project-card').filter({ hasText: 'Launch site' }).click();
  await panel.getByTestId('github-refresh').click();
  await expect.poll(() => server.lastGithubAuth()).toBe(`Bearer ${token}`);
});
