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
/** An app is docked: beside the rail (the default) or in the dock on the right. */
const dockOpen = (win: Page) =>
  invoke<{ notes: unknown; appDock: unknown }>(win, 'layout:get').then(
    (l) => l.notes !== null || l.appDock !== null,
  );

test('App Hub: add apps, open one docked beside the page, in a tab or its own window; per-Space; kept', async () => {
  test.setTimeout(120_000);
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    // Settings → Apps: add by address, and from the catalogue's groups.
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="apps"]').click();
    await expect(settings.getByTestId('app-catalog')).toContainText('Communication');
    await settings.getByTestId('app-add-url').fill('not an address');
    await settings.getByTestId('app-add').click();
    await expect(settings.getByTestId('app-add-error')).toBeVisible();
    await settings.getByTestId('app-add-url').fill(server.url('/one'));
    await settings.getByTestId('app-add-name').fill('Desk');
    await settings.getByTestId('app-add').click();
    await expect(settings.getByTestId('app-row')).toHaveCount(1);
    await expect(win.getByTestId('favorite-tile')).toHaveCount(1);

    // Open in the side panel: it docks beside the page with its own header.
    await settings.getByTestId('app-open-in').selectOption('panel');
    // Here: the dock on the right that Notes shares (apps open beside the rail by default).
    await invoke(settings, 'ui:set', { appSide: 'right' });
    await closeSettings(app);
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page One');
    expect(await dockOpen(win)).toBe(true);
    // Notes takes the dock; the app steps aside (one at a time), and back again.
    await invoke(win, 'notes:panel', { view: 'notes' });
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    // Clicking it again closes it; the dock gives the room back.
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
    await expect.poll(() => dockOpen(win)).toBe(false); // after it slides out
    // Open as Tab: the page joins Today as it is.
    await win.getByTestId('favorite-tile').click();
    await win.getByTestId('app-panel-tab').click();
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // Only in this Space: another Space doesn't show it.
    await clickMenu(app, 'settings');
    const settings2 = await pageWith(app, '#/settings');
    await settings2.locator('[data-testid="settings-nav"][data-section="apps"]').click();
    await settings2.getByTestId('app-spaces').click();
    await settings2.getByTestId('app-space-option').first().click();
    await expect(settings2.getByTestId('app-spaces')).toContainText('Only in');
    await closeSettings(app);
    await clickMenu(app, 'new-space');
    await expect(win.getByTestId('favorite-tile')).toHaveCount(0);
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData });
  try {
    const { app, win } = second;
    // Kept: in the first Space, it still opens in the panel.
    await invoke(win, 'spaces:cycle', { direction: -1 }).catch(() => undefined);
    await expect(win.getByTestId('favorite-tile')).toHaveCount(1);
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    // Its own window: Little Orbit.
    await win.getByTestId('app-panel-close').click();
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="apps"]').click();
    await settings.getByTestId('app-open-in').selectOption('window');
    await closeSettings(app);
    const windows = () =>
      app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length,
      );
    const before = await windows();
    await win.getByTestId('favorite-tile').click();
    await expect.poll(windows).toBe(before + 1);
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
  } finally {
    await second.close();
    await server.close();
  }
});
