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

test('HTML fullscreen fills the window, and leaving restores the layout', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/video'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Video');
  const page = app.windows().find((p) => p.url().includes('/video'))!;

  const state = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      const [width, height] = w.getContentSize();
      const visible = w.contentView.children
        .filter((v) => v.getVisible())
        .map((v) => v.getBounds());
      return { fullScreen: w.isFullScreen(), view: visible[0], width, height };
    });

  await page.locator('#fs').click();
  await expect.poll(async () => (await state()).fullScreen, { timeout: 10_000 }).toBe(true);
  await expect
    .poll(async () => {
      const s = await state();
      return s.view?.x === 0 && s.view?.y === 0 && s.view?.width === s.width;
    })
    .toBe(true);
  await expect(win.getByTestId('toolbar')).toHaveCount(0);

  // Like pressing Esc in a video. Don't await the promise: it settles only after the resize.
  await page.evaluate(() => {
    type Doc = { exitFullscreen(): Promise<void> };
    void (globalThis as unknown as { document: Doc }).document.exitFullscreen();
  });
  await expect.poll(async () => (await state()).fullScreen, { timeout: 10_000 }).toBe(false);
  await expect(win.getByTestId('toolbar')).toBeVisible();
  await expect.poll(async () => (await state()).view?.y).toBe(44); // 8 inset + 36 toolbar
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
