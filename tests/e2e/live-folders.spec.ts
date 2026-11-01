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
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

test('Live Folder from a site’s RSS feed: fills, refreshes with a dot, opening clears it', async () => {
  const { app, win } = orbit;

  // Add a feed by typing the site's address; Orbit finds its feed.
  await clickMenu(app, 'live-rss');
  const bar = await overlay(app);
  await expect(bar.getByTestId('prompt')).toHaveAttribute('data-kind', 'input');
  await bar.getByTestId('prompt-input').fill(server.url('/blog'));
  await bar.getByTestId('prompt-confirm').click();

  const folder = win.locator('[data-testid="folder-row"][data-live-folder="true"]');
  await expect(folder).toContainText('Test Feed');
  const posts = win.getByTestId('pinned-list').getByTestId('tab-row');
  await expect(posts).toHaveCount(2);
  await expect(posts.nth(0)).toContainText('Post 2'); // newest first
  await expect(win.getByTestId('unread-dot')).toHaveCount(0); // the first fill isn't "new"

  // A new post appears on refresh, with a dot.
  await fetch(server.url('/feed/publish'));
  await clickMenu(app, 'live-refresh');
  await expect(posts).toHaveCount(3);
  await expect(posts.nth(0)).toContainText('Post 3');
  await expect(posts.nth(0).getByTestId('unread-dot')).toBeVisible();

  // Opening it clears the dot.
  await posts.nth(0).click();
  await expect(win.getByTestId('toolbar-address')).toContainText('Post 3');
  await expect(win.getByTestId('unread-dot')).toHaveCount(0);
});

test('a bad feed address is explained, and nothing is added', async () => {
  const { app, win } = orbit;
  await clickMenu(app, 'live-rss');
  const bar = await overlay(app);
  await bar.getByTestId('prompt-input').fill(server.url('/one')); // a page with no feed
  await bar.getByTestId('prompt-confirm').click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('No RSS or Atom feed found there');
  await expect(win.locator('[data-testid="folder-row"][data-live-folder="true"]')).toHaveCount(0);
});
