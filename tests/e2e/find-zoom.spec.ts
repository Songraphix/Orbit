import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer();
});
test.afterEach(async () => {
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
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
const zoomOf = (app: ElectronApplication, fragment: string) =>
  app.evaluate(
    ({ webContents }, f) =>
      webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes(f))
        ?.getZoomLevel() ?? null,
    fragment,
  );

test('⌘F finds in the page, counts matches, steps, and Esc closes', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await openTab(win, server.url('/words'));
    await expect(win.getByTestId('toolbar-address')).toContainText('Words');

    await clickMenu(app, 'find');
    const input = win.getByTestId('find-input');
    await expect(input).toBeFocused();
    await input.fill('orbit');
    await expect(win.getByTestId('find-count')).toHaveText('1/3');
    await input.press('Enter');
    await expect(win.getByTestId('find-count')).toHaveText('2/3');
    await clickMenu(app, 'find-previous');
    await expect(win.getByTestId('find-count')).toHaveText('1/3');
    await input.fill('zzz');
    await expect(win.getByTestId('find-count')).toHaveText('No matches');

    await input.press('Escape');
    await expect(win.getByTestId('find-bar')).toHaveCount(0);
    await expect(win.getByTestId('toolbar-address')).toBeVisible();
  } finally {
    await orbit.close();
  }
});

test('zoom is per site and survives a relaunch; copy URL shows a toast', async () => {
  const first = await launchOrbit();
  await openTab(first.win, server.url('/words'));
  await expect(first.win.getByTestId('toolbar-address')).toContainText('Words');

  await clickMenu(first.app, 'zoom-in');
  await clickMenu(first.app, 'zoom-in');
  await expect.poll(() => zoomOf(first.app, '/words')).toBe(1);
  await expect(first.win.getByTestId('toolbar-toast')).toContainText('Zoom 120%');

  await clickMenu(first.app, 'copy-url');
  await expect(first.win.getByTestId('toolbar-toast')).toContainText('Copied link');
  await expect(first.win.getByTestId('toolbar-toast')).toHaveCount(0, { timeout: 4000 });
  await first.close({ keepData: true });

  const second = await launchOrbit({ userData: first.userData });
  try {
    await expect(second.win.getByTestId('toolbar-address')).toContainText('Words');
    await expect.poll(() => zoomOf(second.app, '/words')).toBe(1);
    await clickMenu(second.app, 'zoom-reset');
    await expect.poll(() => zoomOf(second.app, '/words')).toBe(0);
  } finally {
    await second.close();
  }
});
