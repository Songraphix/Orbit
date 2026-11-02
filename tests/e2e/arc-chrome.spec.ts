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
    'New Note',
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

  // Up four times from New Tab (past Split, Boost and Note) is New Easel.
  await win.getByTestId('create-button').click();
  await expect(menu).toBeVisible(); // keys only count once it's open
  await expect(bar.locator('[data-testid="create-item"][data-action="tab"]')).toHaveClass(
    /bg-white/,
  );
  for (let i = 0; i < 4; i++) await bar.keyboard.press('ArrowUp');
  await bar.keyboard.press('Enter');
  // The first Easel after a build can take a few seconds to appear.
  await expect
    .poll(() => app.windows().some((p) => p.url().includes('#/easel/')), { timeout: 15_000 })
    .toBe(true);
});

test('pushing the sidebar edge to the window edge hides it', async () => {
  const { win } = orbit;
  const handle = await box(win, 'sidebar-resize-handle');
  const y = handle.y + 200;
  await win.mouse.move(handle.x + handle.width / 2, y);
  await win.mouse.down();
  await win.mouse.move(130, y, { steps: 4 });
  await expect.poll(async () => (await box(win, 'sidebar')).width).toBe(150); // held at the minimum
  // At the minimum, favorites are two square tiles; the address pill still fits.
  await expect(win.getByTestId('address-pill')).toBeVisible();
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

test('downloads: the badge flies to the shelf; the card shows "x/y MB" while downloading', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
  const bar = await overlay(app);
  await invoke(win, 'tabs:create', { url: server.url('/big.bin') });
  await expect(bar.getByTestId('download-flight')).toHaveCount(1);
  const card = win.getByTestId('download-item');
  await expect(card).toHaveAttribute('data-state', 'progressing');
  await expect(card).toContainText(/\d+\.\d\/2\.9 MB/);
  await expect(card).toHaveAttribute('data-state', 'completed', { timeout: 10_000 });
  await expect(bar.getByTestId('download-flight')).toHaveCount(0); // gone after its second
});

test('the sidebar’s address pill: the site, and its link icon copies the address', async () => {
  const { app, win } = orbit;
  const url = server.url('/one');
  await invoke(win, 'tabs:create', { url });
  const pill = win.getByTestId('address-pill');
  await expect(pill).toContainText('127.0.0.1');
  await win.getByTestId('address-copy').click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('Copied link');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(url);
});

/** Records the native menus main builds (labels only) instead of showing them. */
const recordMenus = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    const g = globalThis as unknown as { menus: string[][] };
    g.menus = [];
    Menu.buildFromTemplate = ((template: { label?: string; type?: string }[]) => {
      g.menus.push(template.map((i) => i.label ?? (i.type === 'separator' ? '—' : '')));
      return { popup: () => undefined };
    }) as never;
  });
const lastMenu = (app: ElectronApplication) =>
  app.evaluate(() => {
    const g = globalThis as unknown as { menus: string[][] };
    return g.menus.at(-1) ?? null;
  });

test('right-clicking the sidebar’s empty space shows Arc’s sidebar menu', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await recordMenus(app);
  await app.evaluate(({ clipboard }) => clipboard.writeText('example.com'));

  await win.getByTestId('today-end').click({ button: 'right' });
  await expect
    .poll(() => lastMenu(app))
    .toEqual([
      'New Tab',
      'New Folder',
      'New Split View',
      'New Easel',
      'Quick Note',
      '—',
      'Paste and Go to “example.com”',
      '—',
      'Tidy Today',
      'Sort Today',
      'Close Duplicate Tabs',
      'Archive Tabs from Before Today',
      'Clear Today',
      '—',
      'Space “Personal”',
      'Library',
      '—',
      'Hide Sidebar',
    ]);

  // A tab row keeps its own menu.
  await win.locator('[data-testid="tab-row"]', { hasText: 'Page One' }).click({ button: 'right' });
  await expect.poll(async () => (await lastMenu(app))?.[0]).toBe('Pin Tab');
});
