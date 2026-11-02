import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  orbit = await launchOrbit();
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
/** The next save or open dialog answers with `path` (the native one isn't shown). */
const answerDialogs = (app: ElectronApplication, path: string) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never;
  }, path);
const openUrlFromAnotherApp = (app: ElectronApplication, url: string) =>
  app.evaluate(({ app: electronApp }, u) => {
    electronApp.emit('open-url', { preventDefault: () => undefined }, u);
  }, url);

test('tasks go out as CSV or Markdown and come in from other services', async () => {
  const { app, win } = orbit;
  await invoke(win, 'notes:panel', { view: 'projects' });
  const panel = await pageWith(app, '#/notes/panel/projects');
  await panel.getByTestId('project-card').filter({ hasText: 'SIRATEQ Brand Guide' }).click();
  const more = panel.getByTestId('project-detail').getByTestId('more-menu').first();

  // Export: the project's tasks as CSV, then as a checklist.
  const csv = join(orbit.userData, 'brand.csv');
  await answerDialogs(app, csv);
  await more.click();
  await panel.getByTestId('menu-export-csv').click();
  await expect(panel.getByTestId('work-toast')).toHaveText('Tasks exported');
  const exported = readFileSync(csv, 'utf8');
  expect(exported.split('\r\n')[0]).toBe('Title,Description,Status,Priority,Due Date,Project');
  expect(exported).toContain('Finish brand guide,,In Progress,High');
  const md = join(orbit.userData, 'brand.md');
  await answerDialogs(app, md);
  await more.click();
  await panel.getByTestId('menu-export-md').click();
  await expect.poll(() => readFileSync(md, 'utf8')).toContain('- [x] Logo variations');

  // Import: another service's CSV (columns found by name) adds its tasks to the project.
  const asana = join(orbit.userData, 'asana.csv');
  writeFileSync(
    asana,
    'Task ID,Name,Notes,Due Date,Section/Column\n1,Print business cards,Matte,11/30/2026,To do\n2,Order samples,,,Done\n',
  );
  const before = Number(await panel.getByTestId('stat-total').textContent());
  await answerDialogs(app, asana);
  await more.click();
  await panel.getByTestId('menu-import').click();
  await expect(panel.getByTestId('work-toast')).toHaveText('Imported 2 tasks');
  await expect(panel.getByTestId('stat-total')).toHaveText(String(before + 2));
  await expect(
    panel
      .getByTestId('project-tasks')
      .getByTestId('task-row')
      .filter({ hasText: 'Print business cards' }),
  ).toHaveCount(1);
});

test('rules: links from other apps go to the Space you choose', async () => {
  const { app, win } = orbit;
  const spaceName = win.getByTestId('space-name');
  const home = (await spaceName.textContent()) ?? '';
  await clickMenu(app, 'new-space');
  await win.getByTestId('rename-input').fill('Design');
  await win.getByTestId('rename-input').press('Enter');
  await expect(spaceName).toHaveText('Design');
  await invoke(win, 'spaces:cycle', { direction: -1 });
  await expect(spaceName).toHaveText(home);

  // Settings → Rules: 127.0.0.1 → Design.
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="rules"]').click();
  await expect(settings.getByTestId('rules-empty')).toBeVisible();
  await settings.getByTestId('rule-pattern').fill('figma');
  await settings.getByTestId('rule-add').click();
  await expect(settings.getByTestId('rule-error')).toContainText('Type a site');
  await settings.getByTestId('rule-pattern').fill('http://127.0.0.1/');
  await settings.getByTestId('rule-target').selectOption({ label: 'in Design' });
  await settings.getByTestId('rule-add').click();
  await expect(settings.getByTestId('rule-text')).toHaveText(['Links to 127.0.0.1 open in Design']);
  await closeSettings(app);

  // A matching link from another app opens in Design, in the main window.
  await openUrlFromAnotherApp(app, server.url('/two'));
  await expect(spaceName).toHaveText('Design');
  await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  // Turned off, links go back to Little Orbit.
  await clickMenu(app, 'settings');
  const again = await pageWith(app, '#/settings');
  await again.locator('[data-testid="settings-nav"][data-section="rules"]').click();
  await again.getByTestId('rule-toggle').uncheck();
  await openUrlFromAnotherApp(app, server.url('/three'));
  await expect.poll(() => app.windows().some((p) => p.url().includes('mode=little'))).toBe(true);
});
