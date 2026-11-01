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
const openTab = (win: Page, url: string) =>
  win.evaluate(
    (u) =>
      (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:create', {
        url: u,
      }),
    url,
  );
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

test('sites must ask before showing notifications; the answer is remembered', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/notify'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Notify');
  const page = app.windows().find((p) => p.url().includes('/notify'))!;

  await page.locator('#ask').click();
  const bar = await overlay(app);
  await expect(bar.getByTestId('prompt')).toContainText('wants to show notifications');
  await bar.getByTestId('prompt-allow').click();
  await expect(page).toHaveTitle('perm:granted');

  // Asked again after a reload: granted straight away, no prompt.
  await page.reload();
  await page.locator('#ask').click();
  await expect(page).toHaveTitle('perm:granted');
  await expect(bar.getByTestId('prompt')).toHaveCount(0);
});

test('blocking is remembered too', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/notify'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Notify');
  const page = app.windows().find((p) => p.url().includes('/notify'))!;
  await page.locator('#ask').click();
  const bar = await overlay(app);
  await bar.getByTestId('prompt-block').click();
  await expect(page).toHaveTitle('perm:denied');
  await page.reload();
  await page.locator('#ask').click();
  await expect(page).toHaveTitle('perm:denied');
});

test('HTTP sign-in asks for a username and password', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/auth'));
  const bar = await overlay(app);
  await expect(bar.getByTestId('prompt')).toHaveAttribute('data-kind', 'login');
  await bar.getByTestId('login-username').fill('orbit');
  await bar.getByTestId('login-password').fill('s3cret');
  await bar.getByTestId('login-submit').click();
  await expect(win.getByTestId('toolbar-address')).toContainText('Secret');
});
