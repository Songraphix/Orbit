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

/** Runs code in the first page whose URL contains `fragment`. */
const inPage = (app: ElectronApplication, fragment: string, code: string) =>
  app.evaluate(
    ({ webContents }, [f, c]) => {
      const target = webContents.getAllWebContents().find((w) => w.getURL().includes(f));
      if (!target) throw new Error(`no page with ${f}`);
      return target.executeJavaScript(c, true);
    },
    [fragment, code] as const,
  );

async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

const pageCount = (app: ElectronApplication, fragment: string) =>
  app.evaluate(
    ({ webContents }, f) =>
      webContents.getAllWebContents().filter((w) => w.getURL().includes(f)).length,
    fragment,
  );

test('links from a pinned tab to another site open in Peek; Open as Tab keeps the page', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/peek') });
    await clickMenu(app, 'toggle-pin');
    const pinned = win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]');
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await expect(pinned).toHaveText(['Peek Source']);
    await expect(today).toHaveText(['New Tab']);

    await inPage(app, '/peek', 'document.getElementById("out").click()');
    const bar = await overlay(app);
    await expect(bar.getByTestId('peek')).toBeVisible();
    await expect(bar.getByTestId('peek-address')).toContainText('localhost');
    await expect(today).toHaveText(['New Tab']); // no tab yet
    await expect.poll(() => pageCount(app, 'localhost')).toBe(1);

    // Mark the page, promote it, and check the mark survived (no reload).
    await inPage(app, 'localhost', 'window.__peekMark = 42');
    await bar.getByTestId('peek-promote').click();
    await expect(today).toHaveText(['Page Two', 'New Tab']);
    await expect(win.locator('[aria-current="page"]')).toHaveText('Page Two');
    await expect(bar.getByTestId('peek')).toHaveCount(0);
    expect(await inPage(app, 'localhost', 'window.__peekMark')).toBe(42);
  } finally {
    await orbit.close();
  }
});

test('Peek closes from the backdrop; links from Today tabs open in Peek too', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await invoke(win, 'tabs:create', { url: server.url('/peek') });
    await clickMenu(app, 'toggle-pin');
    await expect(win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]')).toHaveText([
      'Peek Source',
    ]);

    await inPage(app, '/peek', 'document.getElementById("out").click()');
    const bar = await overlay(app);
    await expect(bar.getByTestId('peek')).toBeVisible();
    await bar.getByTestId('peek-backdrop').click({ position: { x: 4, y: 4 } });
    await expect(bar.getByTestId('peek')).toHaveCount(0);
    await expect.poll(() => pageCount(app, 'localhost')).toBe(0);

    // A Today tab's link to another site (an ad on YouTube, say) peeks too, by default.
    await invoke(win, 'tabs:create', { url: server.url('/peek') });
    await expect(today).toHaveText(['Peek Source', 'New Tab']);
    await app.evaluate(({ webContents }) => {
      const pages = webContents.getAllWebContents().filter((w) => w.getURL().includes('/peek'));
      // The Today copy is the newest page.
      return pages.at(-1)!.executeJavaScript('document.getElementById("out").click()', true);
    });
    await expect(bar.getByTestId('peek')).toBeVisible();
    await expect(today).toHaveText(['Peek Source', 'New Tab']); // no new tab
  } finally {
    await orbit.close();
  }
});

test("Arc-style: a pinned tab's same-site link peeks; Back, then Open in Split View", async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await invoke(win, 'tabs:create', { url: server.url('/peek') });
    await clickMenu(app, 'toggle-pin');
    await expect(win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]')).toHaveText([
      'Peek Source',
    ]);

    // Same site as the pinned tab (like a design from the Canva favourite): it still peeks.
    await inPage(app, '/peek', 'document.getElementById("same").click()');
    const bar = await overlay(app);
    await expect(bar.getByTestId('peek')).toBeVisible();
    await expect(bar.getByTestId('peek-address')).toContainText('127.0.0.1');
    await expect(bar.getByTestId('peek-actions').getByRole('button')).toHaveCount(3);
    await expect(bar.getByTestId('peek-back')).toBeDisabled();
    await expect(today).toHaveText(['New Tab']);

    // Navigate inside the peek, then Back.
    await expect.poll(() => pageCount(app, '/two')).toBe(1);
    await inPage(app, '/two', 'location.href = "/peek"');
    await expect(bar.getByTestId('peek-back')).toBeEnabled();
    await bar.getByTestId('peek-back').click();
    await expect(bar.getByTestId('peek-back')).toBeDisabled();
    await bar.getByTestId('peek-reload').click();

    // Split View: the page joins Today and opens beside the pinned tab.
    await bar.getByTestId('peek-split').click();
    await expect(bar.getByTestId('peek')).toHaveCount(0);
    await expect(today).toHaveText(['Page Two', 'New Tab']);
    await expect(win.getByTestId('split-divider')).toBeVisible();
  } finally {
    await orbit.close();
  }
});

test('like Arc, the sidebar stays usable: leave the tab and its Peek waits, badged; come back to it', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const pinned = win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]');
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await invoke(win, 'tabs:create', { url: server.url('/peek') });
    await clickMenu(app, 'toggle-pin');
    await expect(pinned).toHaveText(['Peek Source']);

    await inPage(app, '/peek', 'document.getElementById("out").click()');
    const bar = await overlay(app);
    await expect(bar.getByTestId('peek')).toBeVisible();
    await expect(pinned.getByTestId('peek-badge')).toHaveCount(1);
    // The overlay covers the page area only: the sidebar keeps taking clicks.
    const overlayX = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 0)!;
      const view = win.contentView.children.find(
        (v) =>
          'webContents' in v &&
          (v as Electron.WebContentsView).webContents.getURL().includes('/overlay/'),
      )!;
      return view.getBounds().x;
    });
    expect(overlayX).toBeGreaterThan(200);

    // Another tab: the Peek steps aside but stays alive, its icon on the pinned tab.
    await today.first().click();
    await expect(bar.getByTestId('peek')).toHaveCount(0);
    await expect.poll(() => pageCount(app, 'localhost')).toBe(1);
    await expect(pinned.getByTestId('peek-badge')).toHaveCount(1);

    // Back to the pinned tab: the same Peek again (not reloaded).
    await inPage(app, 'localhost', 'window.__peekMark = 7');
    await pinned.first().click();
    await expect(bar.getByTestId('peek')).toBeVisible();
    expect(await inPage(app, 'localhost', 'window.__peekMark')).toBe(7);

    // The command bar sets it aside too, and Escape there brings it back.
    await clickMenu(app, 'new-tab');
    await expect(bar.getByTestId('peek')).toHaveCount(0);
    await bar.keyboard.press('Escape');
    await expect(bar.getByTestId('peek')).toBeVisible();

    // Closed: the badge goes with it.
    await bar.getByTestId('peek-close').click();
    await expect(bar.getByTestId('peek')).toHaveCount(0);
    await expect(pinned.getByTestId('peek-badge')).toHaveCount(0);
    await expect.poll(() => pageCount(app, 'localhost')).toBe(0);
  } finally {
    await orbit.close();
  }
});
