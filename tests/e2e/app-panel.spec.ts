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
async function openSettings(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'settings');
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/settings'))).toBe(true);
  return app.windows().find((p) => p.url().includes('#/settings'))!;
}
type AppList = { apps: { id: string; title: string }[] };
/** Adds favourites that open in the docked panel (through Settings → Apps' own calls). */
async function addPanelApps(app: ElectronApplication, apps: { url: string; title: string }[]) {
  const settings = await openSettings(app);
  let list: AppList = { apps: [] };
  for (const a of apps) list = await invoke<AppList>(settings, 'apps:add', a);
  for (const a of list.apps)
    await invoke(settings, 'apps:update', { itemId: a.id, openIn: 'panel' });
  await closeSettings(app);
  return list.apps;
}
const dockWidth = (win: Page) =>
  invoke<{ notes: { width: number } | null }>(win, 'layout:get').then((l) => l.notes?.width ?? 0);

test('the docked panel: drag its edge to resize; the width is kept', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await addPanelApps(app, [{ url: server.url('/one'), title: 'Desk' }]);
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    expect(await dockWidth(win)).toBe(380);

    // Drag the gap before the panel 120 px to the left: the panel widens by as much.
    const edge = (await win.getByTestId('dock-edge').boundingBox())!;
    const y = edge.y + edge.height / 2;
    await win.mouse.move(edge.x + edge.width / 2, y);
    await win.mouse.down();
    await win.mouse.move(edge.x - 60, y, { steps: 5 });
    await win.mouse.move(edge.x - 120 + edge.width / 2, y, { steps: 5 });
    await win.mouse.up();
    await expect.poll(() => dockWidth(win)).toBe(500);
    // The page beside it is live again afterwards (no snapshot left over).
    await expect(win.getByTestId('resize-snapshot')).toHaveCount(0);
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData });
  try {
    const { win } = second;
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    expect(await dockWidth(win)).toBe(500);
    // Double-click: the usual width.
    await win.getByTestId('dock-edge').dblclick();
    await expect.poll(() => dockWidth(win)).toBe(380);
  } finally {
    await second.close();
    await server.close();
  }
});
