import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';

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
const settingsWindows = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => w.webContents.getURL().includes('#/settings'))
      .map((w) => ({ title: w.getTitle(), url: w.webContents.getURL() })),
  );
const tabCount = (win: Page) =>
  invoke<{ tabs: unknown[] }>(win, 'tabs:get').then((t) => t.tabs.length);

test('Settings opens in a window of its own (⌘,), one at a time, on the section asked for', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const tabsBefore = await tabCount(win);

    // ⌘, : a separate window — no tab is added to the browser window.
    await clickMenu(app, 'settings');
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(1);
    expect(await tabCount(win)).toBe(tabsBefore);
    await expect.poll(() => settingsWindows(app).then((w) => w[0]?.title)).toBe('Settings');

    // Asking again brings the same window forward, on the section asked for.
    await invoke(win, 'commandbar:open', { mode: 'new' });
    await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
    const bar = app.windows().find((p) => p.url().includes('/overlay/'))!;
    await bar.getByTestId('command-input').fill('manage apps');
    await bar.getByTestId('command-item').filter({ hasText: 'Manage Apps' }).click();
    await expect
      .poll(() => settingsWindows(app).then((w) => w.map((x) => x.url)))
      .toEqual([expect.stringContaining('#/settings/apps')]);
    const settings = app.windows().find((p) => p.url().includes('#/settings'))!;
    await settings.getByTestId('settings-page').waitFor();

    // It acts on the browser window: Appearance changes the app; Apps adds to its Favorites.
    await settings.locator('[data-testid="settings-nav"][data-section="apps"]').click();
    await settings.getByTestId('catalog-app').first().click();
    await expect(win.getByTestId('favorite-tile')).toHaveCount(1);

    // The profile menu's links and the assistant's "Open Settings" use it too.
    await invoke(bar, 'profile:open', { page: 'shortcuts' });
    await expect
      .poll(() => settingsWindows(app).then((w) => w.map((x) => x.url)))
      .toEqual([expect.stringContaining('#/settings/shortcuts')]);

    await closeSettings(app);
    expect(await settingsWindows(app)).toEqual([]);
    // No tab ever showed Settings (the extra one is the app added from the catalogue).
    const urls = await invoke<{ tabs: { url: string }[] }>(win, 'tabs:get').then((t) =>
      t.tabs.map((x) => x.url),
    );
    expect(urls.some((u) => u.startsWith('orbit://settings'))).toBe(false);
  } finally {
    await orbit.close();
  }
});
