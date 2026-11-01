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
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );

async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

test('site controls: settings for this site, Developer Mode, copy link', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  await win.getByTestId('toolbar-site-controls').click();
  const bar = await overlay(app);
  const popover = bar.getByTestId('site-controls');
  await expect(popover).toBeVisible();
  await expect(bar.getByTestId('site-security')).toHaveText('Not Secure');
  const rows = bar.getByTestId('site-setting');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('NotificationsAsk');
  await expect(rows.nth(1)).toContainText('PreviewEnabled');
  // 127.0.0.1 is a local server: Developer Mode is suggested.
  await expect(rows.nth(2)).toContainText('suggested');

  // Turn Developer Mode on (the row's native menu does this).
  await invoke(bar, 'sitecontrols:pick', { key: 'devMode', value: 'on' });
  await expect(rows.nth(2)).toHaveAttribute('data-value', 'on');
  await expect(win.getByTestId('toolbar-full-url')).toHaveText(server.url('/one'));
  await expect(win.getByTestId('toolbar-devtools')).toBeVisible();

  // Console errors show as a badge.
  await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .find((w) => w.getURL().includes('/one'))!
      .executeJavaScript('console.error("a"); console.error("b")'),
  );
  await expect(win.getByTestId('toolbar-errors')).toHaveText('2');

  // Unknown values are refused.
  await invoke(bar, 'sitecontrols:pick', { key: 'devMode', value: 'maybe' });
  await expect(rows.nth(2)).toHaveAttribute('data-value', 'on');

  // Copy Link closes the popover and puts the URL on the clipboard.
  await bar.getByTestId('site-copy').click();
  await expect(popover).toHaveCount(0);
  await expect(win.getByTestId('toolbar-toast')).toContainText('Copied link');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(server.url('/one'));

  // Esc closes it too; the setting stuck.
  await win.getByTestId('toolbar-site-controls').click();
  await expect(rows.nth(2)).toHaveAttribute('data-value', 'on');
  await bar.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
});

test('Developer Mode is per site: other sites keep the normal toolbar', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
  await win.getByTestId('toolbar-site-controls').click();
  const bar = await overlay(app);
  await invoke(bar, 'sitecontrols:pick', { key: 'devMode', value: 'on' });
  await bar.keyboard.press('Escape');
  await expect(win.getByTestId('toolbar-full-url')).toBeVisible();

  // Same page, another site (localhost ≠ 127.0.0.1).
  await invoke(win, 'tabs:create', { url: server.url('/two').replace('127.0.0.1', 'localhost') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
  await expect(win.getByTestId('toolbar-full-url')).toHaveCount(0);
  await expect(win.getByTestId('toolbar-devtools')).toHaveCount(0);
});

test('Screenshot: drag an area over the page, it lands on the clipboard at that size', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
  await win.getByTestId('toolbar-site-controls').click();
  const bar = await overlay(app);
  await bar.getByTestId('site-screenshot').click();
  await expect(bar.getByTestId('capture-layer')).toBeVisible();

  const page = await app.evaluate(({ BrowserWindow }) => {
    const views = BrowserWindow.getAllWindows()[0]!.contentView.children;
    return views.find((v) => v.getVisible() && v.getBounds().y > 30)!.getBounds();
  });
  await bar.mouse.move(page.x + 20, page.y + 20);
  await bar.mouse.down();
  await bar.mouse.move(page.x + 120, page.y + 70, { steps: 4 });
  await bar.mouse.up();

  await expect(win.getByTestId('toolbar-toast')).toContainText('Screenshot copied');
  await expect(bar.getByTestId('capture-layer')).toHaveCount(0);
  const size = await app.evaluate(async ({ clipboard, nativeImage }) => {
    const [item] = await clipboard.read();
    const blob = await item!.getType('image/png');
    const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()));
    return image.getSize();
  });
  // Retina captures are at device pixels: 100×50 points → 100×50 or 200×100.
  expect([100, 200]).toContain(size.width);
  expect(size.height * 2).toBe(size.width);
});
