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

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = <T = unknown>(page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}
const box = async (page: Page, id: string) => (await page.getByTestId(id).boundingBox())!;

test('the + button opens Arc’s create popover: New Tab ready, keys move, Esc closes', async () => {
  const { app, win } = orbit;
  await win.getByTestId('create-button').click();
  const bar = await overlay(app);
  const menu = bar.getByTestId('create-menu');
  await expect(menu).toBeVisible();
  await expect(bar.getByTestId('create-item')).toHaveText([
    'New Space',
    'New Folder',
    'New Easel⌃⇧E',
    'New Boost',
    'New Split⌃⇧=',
    'New Tab⌘T',
  ]);
  // It sits above the button.
  const button = await box(win, 'create-button');
  const popover = (await menu.boundingBox())!;
  expect(popover.y + popover.height).toBeLessThanOrEqual(button.y);

  await bar.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Return picks New Tab (the default): the command bar opens.
  await win.getByTestId('create-button').click();
  await expect(menu).toBeVisible();
  await bar.keyboard.press('Enter');
  await expect(bar.getByTestId('command-bar')).toBeVisible();
  await bar.keyboard.press('Escape');

  // Up three times from New Tab (past Split and Boost) is New Easel.
  await win.getByTestId('create-button').click();
  await bar.keyboard.press('ArrowUp');
  await bar.keyboard.press('ArrowUp');
  await bar.keyboard.press('ArrowUp');
  await bar.keyboard.press('Enter');
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/easel/'))).toBe(true);
});

test('pushing the sidebar edge to the window edge hides it', async () => {
  const { win } = orbit;
  const handle = await box(win, 'sidebar-resize-handle');
  const y = handle.y + 200;
  await win.mouse.move(handle.x + handle.width / 2, y);
  await win.mouse.down();
  await win.mouse.move(180, y, { steps: 4 });
  await expect.poll(async () => (await box(win, 'sidebar')).width).toBe(200); // held at the minimum
  await win.mouse.move(60, y, { steps: 4 });
  await win.mouse.up();
  await expect(win.getByTestId('sidebar')).toHaveCount(0);
  await expect(win.getByTestId('sidebar-edge')).toHaveCount(1); // and it slides out from there
});

test('favorites: a page with a count in its title shows a dot', async () => {
  const { win } = orbit;
  const tab = await invoke<{ tabId: string }>(win, 'tabs:create', { url: server.url('/inbox') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Inbox (12)');
  await invoke(win, 'sidebar:move', {
    itemId: tab.tabId,
    section: 'favorite',
    parentId: null,
    beforeId: null,
  });
  await expect(win.getByTestId('favorite-tile')).toHaveCount(1);
  await expect(win.getByTestId('favorite-dot')).toHaveCount(1);
});
