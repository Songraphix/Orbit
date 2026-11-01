import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
const openTab = (win: Page, url: string) =>
  win.evaluate(
    (u) =>
      (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:create', {
        url: u,
      }),
    url,
  );

test('pages see a plain Chrome user agent, not Electron', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/one'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
  const page = app.windows().find((p) => p.url().includes('/one'))!;

  const ua = await page.evaluate(() => navigator.userAgent);
  expect(ua).toMatch(/Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
  expect(ua).not.toMatch(/Electron|Orbit/);
});

test('web tabs have a right-click menu attached', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/one'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
  const listeners = await app.evaluate(({ webContents }) => {
    const tab = webContents.getAllWebContents().find((w) => w.getURL().includes('/one'));
    return tab?.listenerCount('context-menu') ?? 0;
  });
  expect(listeners).toBeGreaterThan(0);
});

test('sign-in style popups open as real windows with window.opener, then close', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/opener'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Opener');
  const opener = app.windows().find((p) => p.url().includes('/opener'))!;

  const popupWindow = app.waitForEvent('window');
  await opener.locator('#signin').click();
  const popup = await popupWindow;
  expect(popup.url()).toContain('/popup');

  // The popup is a separate, sandboxed native window — not a tab.
  await expect(win.getByTestId('tab-row')).toHaveCount(2);
  const popupWidth = await app.evaluate(({ BrowserWindow }) => {
    const popupWin = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('/popup'),
    );
    return popupWin?.getContentSize()[0] ?? null;
  });
  expect(popupWidth).toBe(480);
  expect(
    await popup.evaluate(
      () => typeof (globalThis as { require?: unknown; orbit?: unknown }).require,
    ),
  ).toBe('undefined');

  // It talked back through window.opener, then closed itself.
  await expect(opener).toHaveTitle('got:signed-in');
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(1);
});
