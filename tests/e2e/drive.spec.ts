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
async function integrations(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="integrations"]').click();
  return settings;
}
/** The command bar's results for typed words. */
async function results(app: ElectronApplication, words: string) {
  await clickMenu(app, 'new-tab');
  const overlay = await pageWith(app, '/overlay/');
  await overlay.getByTestId('command-input').fill(words);
  return overlay;
}

test('Google Drive: connect read-only, find files in the command bar, Orbit AI reads one and links it; kept; disconnect revokes', async () => {
  test.setTimeout(120_000);
  const server = await startTestServer();
  const env = {
    ORBIT_GOOGLE_TEST_BASE: server.url(''),
    ORBIT_ANTHROPIC_BASE_URL: server.url(''),
    ORBIT_TEST_PLAIN_KEYS: '1',
  };
  const first = await launchOrbit({ env });
  const { userData } = first;
  try {
    const { app, win } = first;
    // Not connected: nothing from Drive in the bar.
    let overlay = await results(app, 'brand');
    await expect(overlay.getByTestId('command-item').first()).toBeVisible();
    await expect(overlay.locator('[data-testid="command-item"][data-kind="drive"]')).toHaveCount(0);
    await overlay.getByTestId('command-input').press('Escape');

    // Connect: Google's page (here: the stand-in) sends Orbit back a code; read-only, offline.
    const settings = await integrations(app);
    await settings.getByTestId('drive-connect').click();
    await expect(settings.getByTestId('drive-disconnect')).toBeVisible();
    await expect(settings.getByText('Connected as drive.tester@example.com')).toBeVisible();
    const asked = server.google().authParams!;
    expect(asked['scope']).toBe('openid email https://www.googleapis.com/auth/drive.readonly');
    expect(asked['access_type']).toBe('offline');
    expect(asked['code_challenge_method']).toBe('S256');
    expect(asked['redirect_uri']).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // The token never reaches a page: the status has no secrets in it.
    expect(JSON.stringify(await invoke(settings, 'drive:status'))).not.toContain('drive-');
    await invoke(settings, 'ai:setKey', { key: 'sk-ant-test-0123456789abcdefghijklmnop' });
    await closeSettings(app);

    // The command bar finds Drive files by name or text; one opens in its Google app.
    overlay = await results(app, 'teal');
    const file = overlay.locator('[data-testid="command-item"][data-kind="drive"]');
    await expect(file).toHaveCount(1);
    await expect(file).toContainText('Brand guide');
    await expect(file).toContainText('Google Docs · edited 2 days ago');
    await file.click();
    await expect
      .poll(async () =>
        (await invoke<{ tabs: { url: string }[] }>(win, 'tabs:get')).tabs.some((t) =>
          t.url.startsWith('https://docs.google.com/document/d/doc-brand'),
        ),
      )
      .toBe(true);

    // Orbit AI searches Drive, reads the file (its text, not just its name) and links it.
    await win.getByTestId('toolbar-assistant').click();
    const panel = await pageWith(app, '#/notes/panel/assistant');
    await panel.getByTestId('assistant-input').fill('DRIVETOOLS what are our brand colours?');
    await panel.getByTestId('assistant-input').press('Enter');
    const answer = panel.getByTestId('assistant-answer').last();
    await expect(answer).toHaveAttribute('data-status', 'done');
    await expect(answer.getByTestId('assistant-answer-text')).toContainText('teal and sand');
    await expect(answer.getByTestId('assistant-action')).toHaveText([
      'Searched your Drive for “brand” (1)',
      'Read “Brand guide” · Open',
    ]);
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData, env });
  try {
    const { app } = second;
    // Kept across a restart (the refresh token, encrypted): Drive still answers.
    const overlay = await results(app, 'budget');
    await expect(overlay.locator('[data-testid="command-item"][data-kind="drive"]')).toContainText(
      'Q4 budget',
    );
    await overlay.getByTestId('command-input').press('Escape');

    // Disconnect: Google is told to forget Orbit's access; Drive leaves the bar.
    const settings = await integrations(app);
    await settings.getByTestId('drive-disconnect').click();
    await expect(settings.getByTestId('drive-connect')).toBeVisible();
    expect(server.google().revoked).toContain('drive-refresh-1');
    await closeSettings(app);
    const after = await results(app, 'budget');
    await expect(after.getByTestId('command-item').first()).toBeVisible();
    await expect(after.locator('[data-testid="command-item"][data-kind="drive"]')).toHaveCount(0);
  } finally {
    await second.close();
    await server.close();
  }
});
