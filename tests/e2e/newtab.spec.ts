import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** The most recently opened new tab page (tab views are pages to Playwright). */
async function newTabPage(app: ElectronApplication, index = -1): Promise<Page> {
  await expect
    .poll(() => app.windows().filter((p) => p.url().includes('#/newtab')).length)
    .toBeGreaterThan(0);
  const pages = app.windows().filter((p) => p.url().includes('#/newtab'));
  const page = pages.at(index)!;
  await page.getByTestId('newtab').waitFor();
  return page;
}

/** Presses Enter in the search box. The page is replaced by the site, so "closed" is success. */
async function submitSearch(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('newtab-search');
  await box.fill(text);
  await box.press('Enter').catch((error: Error) => {
    if (!/closed/i.test(error.message)) throw error;
  });
}

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
/** Calls window.orbit.invoke in a page and reports success or the error message. */
function tryInvoke(page: Page, channel: string, input: unknown = {}) {
  return page.evaluate(
    async ([c, i]) => {
      const { invoke } = (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit;
      return invoke(c, i).then(
        () => 'ok',
        (e: Error) => e.message,
      );
    },
    [channel, input] as const,
  );
}

test('shows wallpaper, clock and a focused search box', async () => {
  const page = await newTabPage(orbit.app);
  await expect(page).toHaveTitle('New Tab');
  await expect(page.getByTestId('wallpaper')).toHaveAttribute('data-wallpaper', 'aurora');
  await expect(page.getByTestId('clock')).toHaveText(/\d{1,2}[:.]\d{2}/);
  await expect(page.getByTestId('newtab-search')).toBeFocused();
});

test('typing an address loads it in the same tab, without the internal API', async () => {
  const { app, win } = orbit;
  const page = await newTabPage(app);
  await submitSearch(page, server.url('/one').replace('http://', ''));

  // Still one tab — the new tab page became the site.
  await expect(win.getByTestId('tab-row')).toHaveText(['Page One']);

  // The site runs in a fresh view: no window.orbit, even though the page before it had one.
  const site = app.windows().find((p) => p.url().includes('/one'))!;
  expect(await site.evaluate(() => typeof (globalThis as { orbit?: unknown }).orbit)).toBe(
    'undefined',
  );
});

test('searches when the input is not an address', async () => {
  const { win } = orbit;
  const page = await newTabPage(orbit.app);
  await submitSearch(page, 'orbit browser');
  const firstTabUrl = async () => {
    const snapshot = (await win.evaluate(() =>
      (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:get', {}),
    )) as { tabs: { url: string }[] };
    return snapshot.tabs[0]!.url;
  };
  await expect.poll(firstTabUrl).toMatch(/^https:\/\/www\.google\.com\/search\?q=orbit%20browser/);
});

test('picking a wallpaper persists and applies to new tab pages', async () => {
  const { app, win } = orbit;
  const page = await newTabPage(app);
  await page.getByTestId('customize-button').click();
  await page.getByTestId('wallpaper-dune').click();
  await expect(page.getByTestId('wallpaper')).toHaveAttribute('data-wallpaper', 'dune');
  await expect(page.getByTestId('wallpaper-dune')).toHaveAttribute('aria-pressed', 'true');

  await win.getByTestId('new-tab-row').click();
  const newTabPages = () => app.windows().filter((p) => p.url().includes('#/newtab'));
  await expect.poll(() => newTabPages().length).toBe(2);
  const second = newTabPages().find((p) => p !== page)!;
  await expect(second.getByTestId('wallpaper')).toHaveAttribute('data-wallpaper', 'dune');
});

test('a custom image is imported into the profile and used as the wallpaper', async () => {
  const { app } = orbit;
  // A real PNG on disk, and the native file picker stubbed to "choose" it.
  const source = join(orbit.userData, 'source.png');
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      )
      .resize({ width: 320, height: 200 })
      .toPNG()
      .toString('base64'),
  );
  writeFileSync(source, Buffer.from(png, 'base64'));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as never;
  }, source);

  const page = await newTabPage(app);
  await page.getByTestId('customize-button').click();
  await page.getByTestId('choose-image').click();
  await expect(page.getByTestId('wallpaper')).toHaveAttribute('data-wallpaper', 'custom');
  await expect(page.getByTestId('wallpaper-custom')).toHaveAttribute('aria-pressed', 'true');
  expect(existsSync(join(orbit.userData, 'wallpapers', 'custom.jpg'))).toBe(true);
});

test('a file that is not an image is rejected with a message', async () => {
  const { app } = orbit;
  const source = join(orbit.userData, 'not-an-image.png');
  writeFileSync(source, 'hello');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as never;
  }, source);

  const page = await newTabPage(app);
  await page.getByTestId('customize-button').click();
  await page.getByTestId('choose-image').click();
  await expect(page.getByRole('alert')).toContainText('not an image');
  await expect(page.getByTestId('wallpaper')).toHaveAttribute('data-wallpaper', 'aurora');
});

test('IPC roles: the new tab page cannot drive tabs, and the shell cannot call newtab:*', async () => {
  const page = await newTabPage(orbit.app);
  expect(await tryInvoke(page, 'tabs:get')).toContain('untrusted_sender');
  expect(await tryInvoke(page, 'sidebar:toggle')).toContain('untrusted_sender');
  expect(await tryInvoke(page, 'newtab:get')).toBe('ok');
  expect(await tryInvoke(orbit.win, 'newtab:get')).toContain('untrusted_sender');
});
