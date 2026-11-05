import { expect, test } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

test('hidden title bar, traffic lights in the toolbar row on the canvas', async () => {
  const orbit = await launchOrbit();
  try {
    // The window is shown on its first paint ('ready-to-show'), so wait for it.
    await expect
      .poll(() =>
        orbit.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()),
      )
      .toBe(true);
    const buttons = await orbit.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.getWindowButtonPosition(),
    );
    expect(buttons).toEqual({ x: 18, y: 20 });

    const dragRegion = await orbit.win.getByTestId('toolbar').evaluate((el) => {
      // Tests compile without DOM typings; describe the one browser API used here.
      type Css = { getPropertyValue(name: string): string };
      const g = globalThis as unknown as { getComputedStyle(el: unknown): Css };
      return g.getComputedStyle(el).getPropertyValue('-webkit-app-region');
    });
    expect(dragRegion).toBe('drag');
  } finally {
    await orbit.close();
  }
});

test('window position and size survive a relaunch', async () => {
  const first = await launchOrbit();
  const target = { x: 120, y: 140, width: 1100, height: 700 };
  await first.app.evaluate(({ BrowserWindow }, bounds) => {
    BrowserWindow.getAllWindows()[0]!.setBounds(bounds);
  }, target);
  await first.close({ keepData: true }); // closing flushes the pending save

  const second = await launchOrbit({ userData: first.userData });
  try {
    const bounds = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.getBounds(),
    );
    expect(bounds).toEqual(target);
  } finally {
    await second.close();
  }
});
