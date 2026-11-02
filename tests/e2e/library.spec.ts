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
  await bar.getByTestId('shot-save').click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('Saved to Library');

  // A download for Library → Downloads.
  await invoke(win, 'tabs:create', { url: server.url('/report.txt') });
  await expect(win.getByTestId('download-item')).toHaveCount(1);
  await win.locator('[data-testid="tab-row"]', { hasText: 'Page One' }).click();

  // The Library button swaps the sidebar to the sections (Img 4) with a panel beside it; the
  // page moves over and stays on screen (Arc).
  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('library-section')).toHaveCount(6);
  await expect(win.getByTestId('tab-list')).toHaveCount(0);
  await expect.poll(() => pageVisible(app, url)).toBe(true);
  const panelRight = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 1)!;
    const views = win.contentView.children
      .filter((v) => v.getVisible())
      // Not the overlay (a download's flight can still be showing).
      .filter((v) => !(v as Electron.WebContentsView).webContents?.getURL().includes('/overlay/'))
      .map((v) => v.getBounds());
    return views.map((b) => b.x).sort((a, b) => a - b);
  });
  expect(panelRight[0]).toBe(116); // the panel starts after the sections column
  expect(panelRight[1]).toBeGreaterThan(400); // the page, pushed right
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

  // A tab opened while the Library is open shows beside it; the Library stays.
  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('library-nav')).toBeVisible();
  await invoke(win, 'tabs:create', { url: server.url('/two') });
  await expect.poll(() => pageVisible(app, server.url('/two'))).toBe(true);
  await expect(win.getByTestId('library-nav')).toBeVisible();
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

test('hovering the Library button lists recent downloads; clicking it opens the Library', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/report.txt') });
  await expect(win.getByTestId('download-item')).toHaveCount(1);
  await expect(win.getByTestId('download-item')).toHaveAttribute('data-state', 'completed');

  // Let the download's flight land first (the overlay takes the pointer while it shows).
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .flatMap((w) => w.contentView.children)
          .some(
            (v) =>
              v.getVisible() &&
              (v as Electron.WebContentsView).webContents?.getURL().includes('/overlay/'),
          ),
      ),
    )
    .toBe(false);
  await win.getByTestId('library-button').hover();
  const recent = win.getByTestId('recent-file');
  await expect(recent).toHaveCount(1);
  await expect(recent).toContainText('report.txt');
  await expect(recent).toContainText('just now');

  // Moving away hides it; clicking the button opens the Library.
  await win.mouse.move(600, 300);
  await expect(win.getByTestId('recent-files')).toHaveCount(0);
  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('library-nav')).toBeVisible();
  await expect(win.getByTestId('recent-files')).toHaveCount(0);
});

test('Library looks like Arc: space columns with their tabs; archived tabs filter and delete', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await invoke(win, 'tabs:create', { url: server.url('/two') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
  await clickMenu(app, 'close-tab'); // Page Two → Archived Tabs (closed by hand)

  // The panel is transparent over the space's colours; the page keeps its card beside it.
  await win.getByTestId('library-button').click();
  await expect(win.getByTestId('content-card')).toHaveCount(1);
  const library = await libraryPage(app);
  const background = await library.evaluate(
    () =>
      (
        globalThis as unknown as { getComputedStyle(e: unknown): { backgroundColor: string } }
      ).getComputedStyle(
        (globalThis as unknown as { document: { documentElement: unknown } }).document
          .documentElement,
      ).backgroundColor,
  );
  expect(background).toBe('rgba(0, 0, 0, 0)');

  // Spaces: a column per space listing its tabs; clicking one opens it and leaves the Library.
  await win.locator('[data-testid="library-section"][data-section="spaces"]').click();
  const column = library.getByTestId('space-entry').first();
  await expect(column).toContainText('Page One');
  await column.getByRole('button', { name: 'Page One' }).click();
  await expect(win.getByTestId('library-nav')).toHaveCount(0);
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  // Archived Tabs: filter by how the tab closed; delete an entry.
  await win.getByTestId('library-button').click();
  await win.locator('[data-testid="library-section"][data-section="archive"]').click();
  // Leaving the Library closed its page; this is a new one.
  await expect
    .poll(() => app.windows().filter((p) => p.url().includes('#/library/')).length)
    .toBe(1);
  const archive = await libraryPage(app);
  const entries = archive.getByTestId('archive-entry');
  await expect(entries).toHaveCount(1);
  await archive.getByTestId('archive-filter').click();
  await archive.getByTestId('filter-auto').click();
  await expect(entries).toHaveCount(0);
  await archive.getByTestId('filter-manual').click();
  await expect(entries).toHaveCount(1);
  await entries.hover();
  await entries.getByTestId('archive-delete').click();
  await expect(entries).toHaveCount(0);
});
