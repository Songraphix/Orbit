import { expect, test } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
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

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const openTab = (win: Page, url: string) =>
  win.evaluate(
    (u) =>
      (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:create', {
        url: u,
      }),
    url,
  );
/**
 * Drops one sidebar item onto a target with HTML drag events carrying Orbit's drag payload.
 * (A synthetic `dragstart` can start a real macOS drag session that blocks until a mouse-up
 * that never comes, so the test fills the DataTransfer itself.) `yFraction`: 0 = top.
 */
async function drag(source: Locator, target: Locator, yFraction = 0.5): Promise<void> {
  const itemId = await source.getAttribute('data-tab-id');
  const box = await target.boundingBox();
  if (!itemId || !box) throw new Error('drag source or target missing');
  const point = { clientX: box.x + 30, clientY: box.y + box.height * yFraction };
  const dataTransfer = await source.page().evaluateHandle((id) => {
    type DT = { setData(type: string, value: string): void };
    const dt = new (globalThis as unknown as { DataTransfer: new () => DT }).DataTransfer();
    dt.setData('application/x-orbit-item', id);
    return dt;
  }, itemId);
  await target.dispatchEvent('dragover', { dataTransfer, ...point });
  await target.dispatchEvent('drop', { dataTransfer, ...point });
}

const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

test('drag to reorder Today, to Pinned, into a folder and onto Favorites', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/one'));
  await openTab(win, server.url('/two'));
  const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
  const pinned = win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]');
  await expect(today).toHaveText(['Page Two', 'Page One', 'New Tab']);

  // Reorder: drop "New Tab" on the top half of "Page Two".
  await drag(today.nth(2), today.nth(0), 0.15);
  await expect(today).toHaveText(['New Tab', 'Page Two', 'Page One']);

  // Drop "Page Two" at the end of Pinned → pinned.
  await drag(today.nth(1), win.getByTestId('pinned-end'));
  await expect(pinned).toHaveText(['Page Two']);
  await expect(today).toHaveText(['New Tab', 'Page One']);

  // Drop "Page One" on the app rail → a favorite (a pinned app).
  await drag(today.nth(1), win.getByTestId('rail-apps'));
  await expect(win.getByTestId('favorite-tile')).toHaveAttribute('aria-label', /^Page One/);
  await expect(today).toHaveText(['New Tab']);

  // New folder, then drop the pinned tab onto the folder's middle → inside it.
  await clickMenu(app, 'new-folder');
  await win.getByTestId('rename-input').press('Enter');
  const folder = win.getByTestId('folder-row');
  await drag(pinned.first(), folder, 0.5);
  await folder.click(); // collapse: the tab inside disappears
  await expect(pinned).toHaveCount(0);
});
