import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

test('tabs on top: a strip replaces the sidebar, switches, closes and opens tabs, and sticks', async () => {
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await expect(win.getByTestId('tab-strip')).toHaveCount(0);

    await clickMenu(app, 'toggle-tabs-top');
    const strip = win.getByTestId('tab-strip');
    await expect(strip).toBeVisible();
    await expect(win.getByTestId('sidebar')).toHaveCount(0);
    const tabs = strip.getByTestId('strip-tab');
    await expect(tabs).toHaveText(['Page Two', 'Page One', 'New Tab']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    // The page sits below the strip.
    const layout = (await invoke(win, 'layout:get')) as { card: { y: number } };
    expect(layout.card.y).toBe(48);

    await tabs.nth(1).click();
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(1).getByTestId('strip-close').click();
    await expect(tabs).toHaveText(['Page Two', 'New Tab']);
    await strip.getByTestId('strip-new-tab').click();
    await expect(tabs).toHaveCount(3);

    // Pinned tabs show as icons.
    await tabs.first().click();
    await clickMenu(app, 'toggle-pin');
    await expect(strip.getByTestId('strip-pinned')).toHaveCount(1);
  } finally {
    await first.close({ keepData: true });
  }
  const second = await launchOrbit({ userData });
  try {
    await expect(second.win.getByTestId('tab-strip')).toBeVisible();
    await clickMenu(second.app, 'toggle-tabs-top');
    await expect(second.win.getByTestId('tab-strip')).toHaveCount(0);
    await expect(second.win.getByTestId('sidebar')).toBeVisible();
  } finally {
    await second.close();
    await server.close();
  }
});
