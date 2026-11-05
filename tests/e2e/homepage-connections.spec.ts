import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import { startTestServer } from './test-server';

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
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
async function homepage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/newtab'))).toBe(true);
  const page = app
    .windows()
    .filter((p) => p.url().includes('#/newtab'))
    .at(-1)!;
  await page.getByTestId('newtab').waitFor();
  return page;
}

test('Homepage connects Orbit: Apps (open where set), Spaces, Ask Orbit (typed or spoken), Google Drive', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit({
    env: {
      ORBIT_ANTHROPIC_BASE_URL: server.url(''),
      ORBIT_TEST_PLAIN_KEYS: '1',
      ORBIT_GOOGLE_TEST_BASE: server.url(''),
      ORBIT_MODELS_DIR: '/nonexistent-orbit-models',
    },
  });
  try {
    // An app set to open beside the page, a second Space, a key for Orbit AI.
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    const list = await invoke<{ apps: { id: string }[] }>(settings, 'apps:add', {
      url: server.url('/two'),
      title: 'Desk',
    });
    await invoke(settings, 'apps:update', { itemId: list.apps[0]!.id, openIn: 'panel' });
    await invoke(settings, 'ai:setKey', { key: 'sk-ant-test-0123456789abcdefghijklmnop' });
    await closeSettings(app);
    await clickMenu(app, 'new-space');
    await invoke(win, 'spaces:cycle', { direction: -1 });

    const page = await homepage(app);
    await page.getByTestId('customize-button').click();
    await page.getByTestId('customize-edit-widgets').click();
    for (const type of ['apps', 'spaces', 'ask', 'drive']) {
      await page.getByTestId('widgets-add').click();
      await page.locator(`[data-testid="gallery-item"][data-type="${type}"]`).click();
    }
    await page.getByTestId('widgets-done').click();

    // Apps: opens where it's set to — here, the docked panel.
    await page.getByTestId('apps-widget-item').filter({ hasText: 'Desk' }).click();
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page Two');
    await win.getByTestId('app-panel-close').click();

    // Spaces: both listed; the other one is a click away.
    const spaces = page.getByTestId('spaces-widget-item');
    await expect(spaces).toHaveCount(2);
    const before = await invoke<{ activeSpaceId: string }>(win, 'sidebar:get');
    await spaces.filter({ hasNotText: 'Personal' }).click();
    await expect
      .poll(async () => (await invoke<{ activeSpaceId: string }>(win, 'sidebar:get')).activeSpaceId)
      .not.toBe(before.activeSpaceId);
    await invoke(win, 'spaces:cycle', { direction: -1 });

    // Ask Orbit: typed questions go to Orbit AI (the panel opens with the answer)…
    const home = await homepage(app);
    await home.getByTestId('ask-widget-input').fill('What can you do?');
    await home.getByTestId('ask-widget-input').press('Enter');
    const panel = await pageWith(app, '#/notes/panel/assistant');
    await expect(panel.getByTestId('assistant-answer').last()).toHaveAttribute(
      'data-status',
      'done',
    );
    expect(JSON.stringify(server.lastAiRequest()!.body['messages'])).toContain('What can you do?');
    // …and the microphone starts voice (here: it first offers the speech model).
    await home.getByTestId('ask-widget-voice').click();
    const overlay = await pageWith(app, '/overlay/');
    await expect(overlay.getByTestId('voice-status')).toHaveAttribute('data-phase', 'needs-model');
    await overlay.getByTestId('command-input').press('Escape');
    await overlay.getByTestId('command-input').press('Escape');

    // Google Drive: not connected → a way to connect; connected → recent files.
    await expect(home.getByTestId('drive-widget-connect')).toBeVisible();
    await home.getByTestId('drive-widget-connect').click();
    const integrations = await pageWith(app, '#/settings');
    await integrations.getByTestId('drive-connect').click();
    await expect(integrations.getByTestId('drive-disconnect')).toBeVisible();
    await closeSettings(app);
    await home.evaluate('dispatchEvent(new Event("focus"))');
    await expect(home.getByTestId('drive-widget-item')).toHaveCount(2);
    await expect(home.getByTestId('drive-widget-item').first()).toContainText('Google');
  } finally {
    await close();
    await server.close();
  }
});
