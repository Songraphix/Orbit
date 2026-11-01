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
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

async function libraryPage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/library/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('#/library/'))!;
}
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

/** Whether a web page at `url` is on screen. */
const pageVisible = (app: ElectronApplication, url: string) =>
  app.evaluate(({ BrowserWindow }, u) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 1)!;
    return win.contentView.children.some(
      (v) =>
        'webContents' in v &&
        (v as Electron.WebContentsView).webContents.getURL() === u &&
        v.getVisible(),
    );
  }, url);

test('Library: sections in the sidebar, media from screenshots, downloads, back to the tabs', async () => {
  const { app, win } = orbit;
  const url = server.url('/one');
  await invoke(win, 'tabs:create', { url });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  // A screenshot of the whole page goes to Library → Media.
  await win.getByTestId('toolbar-site-controls').click();
  const bar = await overlay(app);
  await bar.getByTestId('site-screenshot').click();
  await invoke(bar, 'capture:take', { rect: null });
  await expect(win.getByTestId('toolbar-toast')).toContainText('Screenshot copied');

  // A download for Library → Downloads.
  await invoke(win, 'tabs:create', { url: server.url('/report.txt') });
  await expect(win.getByTestId('download-item')).toHaveCount(1);
  await win.locator('[data-testid="tab-row"]', { hasText: 'Page One' }).click();

  // The Library button swaps the sidebar to the sections (Img 4) and covers the page.
  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('library-section')).toHaveCount(6);
  await expect(win.getByTestId('tab-list')).toHaveCount(0);
  await expect.poll(() => pageVisible(app, url)).toBe(false);
  const library = await libraryPage(app);
  const media = library.getByTestId('media-item');
  await expect(media).toHaveCount(1);
  await expect(media).toHaveAttribute('data-source', 'capture');
  await expect(media.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);

  // Downloads: every download, searchable.
  await win.locator('[data-testid="library-section"][data-section="downloads"]').click();
  await expect(library.getByTestId('download-entry')).toHaveCount(1);
  await expect(library.getByTestId('download-entry')).toContainText('report.txt');
  await library.getByTestId('downloads-search').fill('nothing-like-this');
  await expect(library.getByTestId('download-entry')).toHaveCount(0);

  // Archived Tabs is a section too.
  await win.locator('[data-testid="library-section"][data-section="archive"]').click();
  await expect(library.getByTestId('archive-page')).toBeVisible();

  // Back arrow: the tabs and the page return.
  await win.getByTestId('library-back').click();
  await expect(win.getByTestId('library-nav')).toHaveCount(0);
  await expect(win.getByTestId('tab-list')).toBeVisible();
  await expect.poll(() => pageVisible(app, url)).toBe(true);

  // Opening a tab from anywhere also leaves the Library.
  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('library-nav')).toBeVisible();
  await invoke(win, 'tabs:create', { url: server.url('/two') });
  await expect(win.getByTestId('library-nav')).toHaveCount(0);
  await expect.poll(() => pageVisible(app, server.url('/two'))).toBe(true);
});

test('Library → Spaces: reorder and rename; Boosts section', async () => {
  const { app, win } = orbit;
  await clickMenu(app, 'new-space');
  await expect(win.getByTestId('space-button')).toHaveCount(2);
  await expect(win.getByTestId('rename-input')).toBeFocused(); // New Space starts renaming

  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('library-nav')).toBeVisible();
  await win.locator('[data-testid="library-section"][data-section="spaces"]').click();
  const library = await libraryPage(app);
  const names = library.getByTestId('space-name');
  await expect(names).toHaveCount(2);
  const [first, second] = [await names.nth(0).inputValue(), await names.nth(1).inputValue()];
  // Leaving the rename field (here, by opening the Library) keeps the new space's own name.
  expect(second).toBe('New Space');
  expect(first).not.toBe('New Space');

  // Move the second space up.
  await library.getByTestId('space-entry').nth(1).getByTestId('space-up').click();
  await expect(names.nth(0)).toHaveValue(second);
  await expect(names.nth(1)).toHaveValue(first);

  // Rename it.
  await names.nth(0).fill('Studio');
  await names.nth(0).press('Enter');
  await expect(names.nth(0)).toHaveValue('Studio');

  // Boosts: none yet.
  await win.locator('[data-testid="library-section"][data-section="boosts"]').click();
  await expect(library.getByTestId('library-empty')).toBeVisible();

  // Back in the sidebar, the renamed space comes first.
  await win.getByTestId('library-back').click();
  await expect(win.getByTestId('space-button').first()).toHaveAttribute('aria-label', 'Studio');
});
