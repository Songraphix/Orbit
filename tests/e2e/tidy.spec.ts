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
  // Development-only switches: the SDK talks to the test server, and the key skips the Keychain.
  orbit = await launchOrbit({
    env: { ORBIT_ANTHROPIC_BASE_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' },
  });
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
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function internalPage(app: ElectronApplication, page: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(`#/${page}`))).toBe(true);
  return app.windows().find((p) => p.url().includes(`#/${page}`))!;
}

const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';

test('Tidy: key in Settings, groups Today’s tabs with Claude (titles and sites only), Undo', async () => {
  const { app, win } = orbit;
  for (const path of ['/one', '/words', '/two', '/boost', '/three'])
    await invoke(win, 'tabs:create', { url: server.url(path) });
  await expect(win.getByTestId('tab-list').getByTestId('tab-row')).toHaveCount(6); // + new tab page
  await expect(win.getByTestId('tidy')).toHaveCount(0); // no key yet

  // Settings → AI: a wrong key is refused; a right one is saved and never shown again.
  await clickMenu(app, 'settings');
  const settings = await internalPage(app, 'settings');
  await settings.getByTestId('ai-key').fill('sk-proj-nope');
  await settings.getByTestId('ai-key-save').click();
  await expect(settings.getByTestId('ai-key-error')).toContainText('doesn’t look like');
  await settings.getByTestId('ai-key').fill(KEY);
  await settings.getByTestId('ai-key-save').click();
  await expect(settings.getByTestId('ai-key-remove')).toBeVisible();
  await expect(settings.locator(`text=${KEY}`)).toHaveCount(0);
  await clickMenu(app, 'close-tab'); // Settings

  // Tidy groups the three "Page" tabs into a folder named by Claude.
  const tidyButton = win.getByTestId('tidy');
  await expect(tidyButton).toBeVisible();
  await tidyButton.click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('Tidied into 1 folder');
  const folder = win.getByTestId('tab-list').getByTestId('folder-row');
  await expect(folder).toContainText('Pages');
  const rows = win.getByTestId('tab-list').getByTestId('tab-row');
  await expect(rows.nth(0)).toContainText('Page');
  await expect(rows.nth(1)).toContainText('Page');
  await expect(rows.nth(2)).toContainText('Page');

  // What went to the API: the key, Haiku, titles and sites — never paths.
  const request = server.lastAiRequest()!;
  expect(request.headers['x-api-key']).toBe(KEY);
  expect(request.body['model']).toBe('claude-haiku-5-5');
  const sent = JSON.stringify(request.body['messages']);
  expect(sent).toContain('Page One');
  expect(sent).toContain('127.0.0.1');
  expect(sent).not.toContain('/three');

  // Undo puts everything back.
  await win.getByTestId('untidy').click();
  await expect(folder).toHaveCount(0);
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText('Page Three'); // newest first, as before
});
