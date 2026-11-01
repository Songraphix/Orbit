import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
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

const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

/** The overlay page (command bar lives there). */
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

const overlayVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const views = BrowserWindow.getAllWindows()[0]!.contentView.children;
    return views.at(-1)!.getVisible(); // the overlay is always the top-most view
  });

test('⌘T opens the command bar; typing an address opens it in a new tab', async () => {
  const { app, win } = orbit;
  expect(await overlayVisible(app)).toBe(false);
  await clickMenu(app, 'new-tab');
  const bar = await overlay(app);
  await expect(bar.getByTestId('command-bar')).toBeVisible();
  expect(await overlayVisible(app)).toBe(true);

  await bar.getByTestId('command-input').fill(server.url('/one').replace('http://', ''));
  await expect(bar.getByTestId('command-item').first()).toHaveAttribute('data-kind', 'navigate');
  await bar.getByTestId('command-input').press('Enter');

  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab', 'Page One']);
  await expect.poll(() => overlayVisible(app)).toBe(false);
});

test('history and open tabs show up; picking an open tab switches to it', async () => {
  const { app, win } = orbit;
  // Visit Page One (records history), then go back to the new tab page.
  await clickMenu(app, 'new-tab');
  const bar = await overlay(app);
  await bar.getByTestId('command-input').fill(server.url('/one'));
  await bar.getByTestId('command-input').press('Enter');
  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab', 'Page One']);
  await win.getByTestId('tab-row').first().click();

  await clickMenu(app, 'new-tab');
  await bar.getByTestId('command-input').fill('page one');
  const items = bar.getByTestId('command-item');
  await expect(items.filter({ hasText: 'Switch to tab' })).toHaveCount(1);

  await items.filter({ hasText: 'Switch to tab' }).click();
  await expect(win.locator('[aria-current="page"]')).toHaveText('Page One');
  expect(await win.getByTestId('tab-row').count()).toBe(2); // no duplicate tab
});

test('history results appear for closed pages', async () => {
  const { app, win } = orbit;
  await clickMenu(app, 'new-tab');
  const bar = await overlay(app);
  await bar.getByTestId('command-input').fill(server.url('/three'));
  await bar.getByTestId('command-input').press('Enter');
  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab', 'Page Three']);
  await clickMenu(app, 'close-tab');

  await clickMenu(app, 'new-tab');
  await bar.getByTestId('command-input').fill('three');
  await expect(bar.locator('[data-kind="history"]')).toContainText('Page Three');
});

test('⌘L edits the current address; Esc and clicking outside close the bar', async () => {
  const { app, win } = orbit;
  await clickMenu(app, 'new-tab');
  const bar = await overlay(app);
  await bar.getByTestId('command-input').fill(server.url('/one'));
  await bar.getByTestId('command-input').press('Enter');
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  await clickMenu(app, 'open-location');
  await expect(bar.getByTestId('command-input')).toHaveValue(server.url('/one'));
  await bar.getByTestId('command-input').fill(server.url('/two'));
  await bar.getByTestId('command-input').press('Enter');
  // Same tab navigated, no new tab.
  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab', 'Page Two']);

  await win.getByTestId('toolbar-address').click(); // clicking the address = ⌘L
  await expect(bar.getByTestId('command-bar')).toBeVisible();
  await bar.getByTestId('command-input').press('Escape');
  await expect.poll(() => overlayVisible(app)).toBe(false);

  await clickMenu(app, 'new-tab');
  await bar.getByTestId('command-bar-backdrop').click({ position: { x: 5, y: 5 } });
  await expect.poll(() => overlayVisible(app)).toBe(false);
});

test('commands run from the bar; ⇧⌘T reopens the last closed tab', async () => {
  const { app, win } = orbit;
  await clickMenu(app, 'new-tab');
  const bar = await overlay(app);
  await bar.getByTestId('command-input').fill('toggle sidebar');
  await expect(bar.getByTestId('command-item').first()).toHaveAttribute('data-kind', 'search');
  await bar.locator('[data-kind="command"]').first().click();
  await expect(win.getByTestId('sidebar')).toHaveCount(0);
  await clickMenu(app, 'toggle-sidebar');

  // Copy URL puts the active page's address on the clipboard.
  await clickMenu(app, 'new-tab');
  await bar.getByTestId('command-input').fill(server.url('/two'));
  await bar.getByTestId('command-input').press('Enter');
  await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
  await clickMenu(app, 'copy-url');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(server.url('/two'));
  await clickMenu(app, 'copy-url-markdown');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    `[Page Two](${server.url('/two')})`,
  );

  await clickMenu(app, 'close-tab');
  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab']);
  await clickMenu(app, 'reopen-tab');
  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab', 'Page Two']);
  await expect(win.locator('[aria-current="page"]')).toHaveText('Page Two');
});
