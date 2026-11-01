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
/** The overlay view's bounds and visibility. */
const overlayView = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 1)!;
    const view = win.contentView.children.find(
      (v) =>
        'webContents' in v &&
        (v as Electron.WebContentsView).webContents.getURL().includes('/overlay/'),
    )!;
    return { visible: view.getVisible(), width: view.getBounds().width };
  });

test('hidden sidebar: toggle beside the traffic lights, slides out on the left edge, back in on leaving', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await invoke(win, 'tabs:create', { url: server.url('/two') });
  await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');

  // The button beside the traffic lights hides the sidebar.
  await win.getByTestId('sidebar-toggle').click();
  await expect(win.getByTestId('sidebar')).toHaveCount(0);

  // Resting on the left edge slides it out over the page, in a strip just its width.
  await win.getByTestId('sidebar-edge').hover();
  const bar = await overlay(app);
  const peek = bar.getByTestId('sidebar-peek');
  await expect(peek).toBeVisible();
  await expect.poll(async () => (await overlayView(app)).visible).toBe(true);
  expect((await overlayView(app)).width).toBeLessThan(400);

  // It works like the sidebar: switching tabs.
  await peek.locator('[data-testid="tab-row"]', { hasText: 'Page One' }).click();
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

  // Leaving it slides it back in; the overlay steps aside.
  await bar.evaluate(() =>
    (
      globalThis as unknown as {
        document: { documentElement: { dispatchEvent(e: unknown): void } };
      }
    ).document.documentElement.dispatchEvent(
      new (globalThis as unknown as { MouseEvent: new (t: string) => unknown }).MouseEvent(
        'mouseleave',
      ),
    ),
  );
  await expect(peek).toHaveCount(0);
  await expect.poll(async () => (await overlayView(app)).visible).toBe(false);

  // Its toggle pins the sidebar back. (Away from the edge first: hovering is entering it.)
  await win.mouse.move(600, 300);
  await win.getByTestId('sidebar-edge').hover();
  await peek.getByTestId('sidebar-toggle').click();
  await expect(win.getByTestId('sidebar')).toBeVisible();
  await expect(peek).toHaveCount(0);
});
