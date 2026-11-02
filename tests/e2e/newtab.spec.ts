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
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}

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
  // It previews first; Apply keeps it.
  await expect(page.getByTestId('wallpaper')).toHaveAttribute('data-wallpaper', 'dune');
  await expect(page.getByTestId('wallpaper-dune')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('background-apply').click();
  await expect(page.getByTestId('background-preview-bar')).toHaveCount(0);

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

test('the home page greets you by name, keeps today’s to-dos and shows a quote', async () => {
  const page = await newTabPage(orbit.app);
  await expect(page.getByTestId('greeting')).toHaveText(/^Good (Morning|Afternoon|Evening|Night)/);
  await expect(page.getByTestId('tagline')).toHaveText('Focus. Create. Build. Repeat.');
  await expect(page.getByTestId('quote')).not.toBeEmpty();

  // Your name, saved on the profile (the profile menu shows it too).
  await page.getByTestId('greeting-add-name').click();
  await page.getByTestId('greeting-name').fill('Joseph');
  await page.getByTestId('greeting-name').press('Enter');
  await expect(page.getByTestId('greeting')).toContainText(', Joseph');

  // Today: your real tasks due today. Add two, tick one, take one off today's list.
  const input = page.getByTestId('todo-input');
  await input.fill('Finish brand guide');
  await input.press('Enter');
  await input.fill('Edit video');
  await input.press('Enter');
  const row = (p: typeof page, text: string) => p.getByTestId('todo').filter({ hasText: text });
  await expect(row(page, 'Finish brand guide')).toHaveCount(1);
  await expect(row(page, 'Edit video')).toHaveCount(1);
  await row(page, 'Finish brand guide').getByTestId('todo-check').click();
  await expect(row(page, 'Finish brand guide').getByTestId('todo-check')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await row(page, 'Edit video').hover();
  await row(page, 'Edit video').getByTestId('todo-remove').click();
  await expect(row(page, 'Edit video')).toHaveCount(0);

  // They're tasks: the panel's Tasks has them (done, and without a date).
  await orbit.win.evaluate(() =>
    (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('notes:panel', {
      view: 'tasks',
    }),
  );
  const panel = await pageWith(orbit.app, '#/notes/panel/tasks');
  const tasks = (await panel.evaluate(() =>
    (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('work:get', {}),
  )) as { tasks: { title: string; status: string; dueDate: string | null }[] };
  expect(tasks.tasks.find((t) => t.title === 'Finish brand guide')?.status).toBe('done');
  expect(tasks.tasks.find((t) => t.title === 'Edit video')?.dueDate).toBeNull();

  // A new tab page later shows the same list.
  await orbit.win.evaluate(() =>
    (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:create', {}),
  );
  const second = await newTabPage(orbit.app);
  await expect(row(second, 'Finish brand guide').getByTestId('todo-check')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(row(second, 'Edit video')).toHaveCount(0);
  await expect(second.getByTestId('greeting')).toContainText(', Joseph');
});

test('shortcuts: add one, open it, remove it; widgets and theme can be switched', async () => {
  const page = await newTabPage(orbit.app);
  await page.getByTestId('shortcut-add').click();
  await page.getByTestId('shortcut-url').fill('not a web address');
  await page.getByTestId('shortcut-save').click();
  await expect(page.getByRole('alert')).toContainText('web address');
  await page.getByTestId('shortcut-url').fill(server.url('/two'));
  await page.getByTestId('shortcut-title').fill('Two');
  await page.getByTestId('shortcut-save').click();
  await expect(page.getByTestId('shortcut-name')).toHaveText(['Two']);

  // Light glass, and hiding the quote, stick.
  await page.getByTestId('theme-toggle').click();
  await expect(page.getByTestId('newtab')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('customize-button').click();
  await page.getByTestId('show-quote').uncheck();
  await expect(page.getByTestId('quote')).toHaveCount(0);
  await page.getByTestId('customize-tagline').fill('Ship it.');
  await page.getByTestId('customize-tagline').blur();
  await expect(page.getByTestId('tagline')).toHaveText('Ship it.');

  await page.getByTestId('shortcut').hover();
  await page.getByTestId('shortcut-remove').click();
  await expect(page.getByTestId('shortcut')).toHaveCount(0);

  // A shortcut opens in this tab.
  await page.getByTestId('shortcut-add').click();
  await page.getByTestId('shortcut-url').fill(server.url('/two'));
  await page.getByTestId('shortcut-save').click();
  await page
    .getByTestId('shortcut')
    .click()
    .catch(() => undefined); // the page is replaced by the site
  await expect(orbit.win.getByTestId('toolbar-address')).toContainText('Page Two');
});
