import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

const box = async (page: Page, testId: string) => {
  const b = await page.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`${testId} not visible`);
  return b;
};

test('sidebar toggles from the menu, resizes by drag, and both persist', async () => {
  const first = await launchOrbit();
  const { app, win } = first;

  // Defaults: 260 px sidebar, card inset 8 px to its right.
  await expect(win.getByTestId('sidebar')).toBeVisible();
  expect((await box(win, 'sidebar')).width).toBe(260);
  expect((await box(win, 'content-card')).x).toBe(260);

  // Drag the right edge from 260 → 320 px.
  const handle = await box(win, 'sidebar-resize-handle');
  const y = handle.y + 200;
  await win.mouse.move(handle.x + handle.width / 2, y);
  await win.mouse.down();
  await win.mouse.move(300, y, { steps: 5 });
  await win.mouse.move(320, y, { steps: 5 });
  await win.mouse.up();
  await expect.poll(async () => (await box(win, 'sidebar')).width).toBe(320);
  expect((await box(win, 'content-card')).x).toBe(320);

  // Toggle via the real View → Toggle Sidebar menu item (⌘S).
  const clickToggle = () =>
    app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('toggle-sidebar')!.click(),
    );
  await clickToggle();
  await expect(win.getByTestId('sidebar')).toHaveCount(0);
  expect((await box(win, 'content-card')).x).toBe(8);

  await first.close({ keepData: true });

  // Relaunch: still hidden; showing it again restores the 320 px width.
  const second = await launchOrbit({ userData: first.userData });
  try {
    await expect(second.win.getByTestId('content-card')).toBeVisible();
    await expect(second.win.getByTestId('sidebar')).toHaveCount(0);
    await second.app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.getMenuItemById('toggle-sidebar')!.click(),
    );
    await expect.poll(async () => (await box(second.win, 'sidebar')).width).toBe(320);
  } finally {
    await second.close();
  }
});

test('main rejects out-of-range widths by clamping', async () => {
  const orbit = await launchOrbit();
  try {
    await orbit.win.evaluate(async () => {
      type Invoke = (channel: string, input: unknown) => Promise<unknown>;
      const { invoke } = (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit;
      await invoke('sidebar:setWidth', { width: 5000 });
    });
    await expect.poll(async () => (await box(orbit.win, 'sidebar')).width).toBe(400);
  } finally {
    await orbit.close();
  }
});
