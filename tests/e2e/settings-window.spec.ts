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
/** Settings pages open now (it's a sheet over the browser window, not a window of its own). */
const settingsWindows = (app: ElectronApplication) =>
  Promise.resolve(
    app
      .windows()
      .filter((p) => !p.isClosed() && p.url().includes('#/settings'))
      .map((p) => ({ url: p.url() })),
  );
const windowCount = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const tabCount = (win: Page) =>
  invoke<{ tabs: unknown[] }>(win, 'tabs:get').then((t) => t.tabs.length);

test('Settings opens over the browser window (⌘,), one at a time; a click outside, Esc or × puts it away', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const tabsBefore = await tabCount(win);
    const windowsBefore = await windowCount(app);

    // ⌘, : a sheet over this window — no tab, no other window.
    await clickMenu(app, 'settings');
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(1);
    expect(await tabCount(win)).toBe(tabsBefore);
    expect(await windowCount(app)).toBe(windowsBefore);
    await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
    const bar = app.windows().find((p) => p.url().includes('/overlay/'))!;
    await expect(bar.getByTestId('settings-sheet-backdrop')).toBeVisible();

    // Asking again shows the same one, on the section asked for.
    await clickMenu(app, 'settings');
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(1);
    await invoke(win, 'profile:open', { page: 'shortcuts' });
    await expect
      .poll(() => settingsWindows(app).then((w) => w.map((x) => x.url)))
      .toEqual([expect.stringContaining('#/settings/shortcuts')]);
    const settings = app.windows().find((p) => p.url().includes('#/settings'))!;
    await settings.getByTestId('settings-page').waitFor();

    // It acts on the browser window: Apps adds to its Favorites.
    await settings.locator('[data-testid="settings-nav"][data-section="apps"]').click();
    await settings.getByTestId('catalog-app').first().click();
    await expect(win.getByTestId('favorite-tile')).toHaveCount(1);

    // A click outside it (on the dimmed window) puts it away.
    await bar.getByTestId('settings-sheet-backdrop').click({ position: { x: 20, y: 300 } });
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(0);
    await expect(bar.getByTestId('settings-sheet-backdrop')).toHaveCount(0);

    // Esc too, and its × button.
    await clickMenu(app, 'settings');
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(1);
    const again = app.windows().find((p) => p.url().includes('#/settings'))!;
    await again.getByTestId('settings-page').waitFor();
    await again.keyboard.press('Escape').catch(() => undefined); // its page closes
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(0);
    await clickMenu(app, 'settings');
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(1);
    const third = app.windows().find((p) => p.url().includes('#/settings'))!;
    await third.getByTestId('settings-close').click();
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(0);

    // No tab ever showed Settings (the extra one is the app added from the catalogue).
    const urls = await invoke<{ tabs: { url: string }[] }>(win, 'tabs:get').then((t) =>
      t.tabs.map((x) => x.url),
    );
    expect(urls.some((u) => u.startsWith('orbit://settings'))).toBe(false);
  } finally {
    await orbit.close();
  }
});

test('the sidebar has a Settings button by the Spaces, and Easels under Tasks', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await win.getByTestId('settings-button').click();
    await expect.poll(() => settingsWindows(app).then((w) => w.length)).toBe(1);
    await closeSettings(app);

    await win.locator('[data-testid="workspace-item"][data-view="easels"]').click();
    await expect(
      win.locator('[data-testid="library-section"][data-section="easels"]'),
    ).toHaveAttribute('aria-current', 'page');
  } finally {
    await orbit.close();
  }
});
