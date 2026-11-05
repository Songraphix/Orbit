import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
const invoke = (win: Page, channel: string, input: unknown) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );

test('shows domain / title, and back / forward follow the history', async () => {
  const { app, win } = orbit;
  const address = win.getByTestId('toolbar-address');
  const back = win.getByTestId('toolbar-back');
  const forward = win.getByTestId('toolbar-forward');

  // The Homepage: an invitation to search, nothing to go back to.
  await expect(address).toHaveText('Search or enter a website…');
  await expect(back).toBeDisabled();

  await invoke(win, 'tabs:create', { url: server.url('/one') });
  const host = new URL(server.url('/')).host;
  await expect(address).toHaveText(`${host}/Page One`);

  // Follow a same-tab link to /three.
  const page = app.windows().find((p) => p.url().includes('/one'))!;
  await page.locator('#next').click();
  await expect(address).toContainText('Page Three');
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await back.click();
  await expect(address).toContainText('Page One');
  await expect(forward).toBeEnabled();

  // ⌘] (History → Forward) goes forward again.
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.getMenuItemById('forward')!.click());
  await expect(address).toContainText('Page Three');
});

test('reload re-requests the page; the sidebar button appears when the sidebar is hidden', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  // Mark the live document, reload, and check the mark is gone (a fresh document loaded).
  const page = app.windows().find((p) => p.url().includes('/one'))!;
  await page.evaluate(() => ((globalThis as { marked?: boolean }).marked = true));
  await win.getByTestId('toolbar-reload').click();
  const isMarked = () =>
    page.evaluate(() => (globalThis as { marked?: boolean }).marked ?? false).catch(() => true); // mid-navigation: treat as "not reloaded yet"
  await expect.poll(isMarked).toBe(false);

  await expect(win.getByTestId('toolbar-sidebar')).toHaveCount(0);
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.getMenuItemById('toggle-sidebar')!.click(),
  );
  await win.getByTestId('toolbar-sidebar').click();
  await expect(win.getByTestId('sidebar')).toBeVisible();
});
