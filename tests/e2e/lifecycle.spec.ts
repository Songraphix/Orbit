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
const invoke = <T = unknown>(win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function internalPage(app: ElectronApplication, page: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(`#/${page}`))).toBe(true);
  return app.windows().find((p) => p.url().includes(`#/${page}`))!;
}

test('closed tabs go to Archived Tabs: searchable, restorable; ⇧⌘T uses the archive', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await invoke(win, 'tabs:create', { url: server.url('/words') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Words');
  await clickMenu(app, 'close-tab'); // Words
  await win.locator('[data-testid="tab-row"]', { hasText: 'Page One' }).click();
  await clickMenu(app, 'close-tab'); // Page One

  await clickMenu(app, 'archived-tabs');
  const archive = await internalPage(app, 'archive');
  const entries = archive.getByTestId('archive-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText('Page One'); // newest first
  await archive.getByTestId('archive-search').fill('words');
  await expect(entries).toHaveCount(1);
  await entries.first().getByTestId('archive-restore').click();
  await expect(entries).toHaveCount(0);
  await expect(win.locator('[data-testid="tab-row"]', { hasText: 'Words' })).toHaveCount(1);

  // ⇧⌘T brings back the remaining archived tab.
  await clickMenu(app, 'reopen-tab');
  await expect(win.locator('[data-testid="tab-row"]', { hasText: 'Page One' })).toHaveCount(1);
});

test('Settings change the search engine and sleeping limits; pages sleep and wake', async () => {
  const { app, win } = orbit;
  await clickMenu(app, 'settings');
  const settings = await internalPage(app, 'settings');
  await settings.getByTestId('setting-search-engine').selectOption('duckduckgo');
  await settings.getByTestId('setting-max-live').fill('1');
  await expect(settings.getByTestId('setting-max-live')).toHaveValue('1');

  // Searches now go to DuckDuckGo.
  await invoke(win, 'tabs:create', { url: 'orbit browser' });
  const snap = await invoke<{ tabs: { url: string }[] }>(win, 'tabs:get');
  expect(snap.tabs[0]!.url).toMatch(/^https:\/\/duckduckgo\.com\/\?q=orbit%20browser/);

  // With one page allowed awake, a lifecycle pass puts the others to sleep.
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
  await clickMenu(app, 'run-lifecycle');
  await expect(win.getByTestId('toolbar-toast')).toContainText(/slept [1-9]/);
  const live = await invoke<{ today: { title: string; live: boolean }[] }>(win, 'sidebar:get');
  expect(live.today.filter((t) => t.live).map((t) => t.title)).toEqual(['Page One']);

  // A sleeping tab wakes (loads again) when clicked.
  const sleeping = win.locator('[data-testid="tab-row"][data-live="false"]').first();
  await sleeping.click();
  await expect(win.locator('[data-testid="tab-row"][aria-current="page"]')).toHaveAttribute(
    'data-live',
    'true',
  );
});

test('a crashed page shows a Reload card, and Reload brings it back', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  await app.evaluate(({ webContents }) => {
    webContents
      .getAllWebContents()
      .find((w) => w.getURL().includes('/one'))!
      .forcefullyCrashRenderer();
  });
  await expect(win.getByTestId('crashed')).toBeVisible();
  await win.getByTestId('crashed-reload').click();
  await expect(win.getByTestId('crashed')).toHaveCount(0);
  await expect
    .poll(() =>
      app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((w) => w.getURL().includes('/one') && !w.isCrashed()),
      ),
    )
    .toBe(true);
});
