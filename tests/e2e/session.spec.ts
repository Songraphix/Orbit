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
const invoke = (win: Page, channel: string, input: unknown) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
const loadedUrls = (app: ElectronApplication) =>
  app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()));

test('tabs, their order and the active tab survive a relaunch; others load lazily', async () => {
  const first = await launchOrbit();
  await invoke(first.win, 'tabs:create', { url: server.url('/one') });
  await invoke(first.win, 'tabs:create', { url: server.url('/two') });
  const rows = first.win.getByTestId('tab-row');
  await expect(rows).toHaveText(['Page Two', 'Page One', 'New Tab']);
  await rows.nth(1).click(); // Page One is active when we quit
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'page');
  await first.close({ keepData: true });

  const second = await launchOrbit({ userData: first.userData });
  try {
    const restored = second.win.getByTestId('tab-row');
    await expect(restored).toHaveText(['Page Two', 'Page One', 'New Tab']);
    await expect(restored.nth(1)).toHaveAttribute('aria-current', 'page');

    // Only the active tab loaded; Page Two waits until it's clicked.
    await expect
      .poll(async () => (await loadedUrls(second.app)).some((u) => u.includes('/one')))
      .toBe(true);
    expect((await loadedUrls(second.app)).some((u) => u.includes('/two'))).toBe(false);
    await restored.nth(0).click();
    await expect
      .poll(async () => (await loadedUrls(second.app)).some((u) => u.includes('/two')))
      .toBe(true);

    // Tab shortcuts: ⌃Tab moves to the next tab, ⌘2 jumps to the second, ⌘9 to the last.
    await clickMenu(second.app, 'next-tab');
    await expect(restored.nth(1)).toHaveAttribute('aria-current', 'page');
    await clickMenu(second.app, 'previous-tab');
    await expect(restored.nth(0)).toHaveAttribute('aria-current', 'page');
    await clickMenu(second.app, 'go-to-tab-2');
    await expect(restored.nth(1)).toHaveAttribute('aria-current', 'page');
    await clickMenu(second.app, 'go-to-tab-9');
    await expect(restored.nth(2)).toHaveAttribute('aria-current', 'page');
  } finally {
    await second.close();
  }
});

test('closing every tab means the next launch starts with a new tab page', async () => {
  const first = await launchOrbit();
  await clickMenu(first.app, 'close-tab');
  await expect(first.win.getByTestId('tab-row')).toHaveCount(0);
  await first.close({ keepData: true });

  const second = await launchOrbit({ userData: first.userData });
  try {
    await expect(second.win.getByTestId('tab-row')).toHaveText(['New Tab']);
  } finally {
    await second.close();
  }
});
