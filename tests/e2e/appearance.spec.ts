import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
/** The page's DOM (e2e tests compile without the DOM library). */
type Dom = {
  matchMedia: (q: string) => { matches: boolean };
  getComputedStyle: (el: unknown) => { getPropertyValue: (name: string) => string };
  document: { documentElement: unknown };
};
const dark = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as Dom).matchMedia('(prefers-color-scheme: dark)').matches,
  );
/** The colour a palette surface paints `bg-white` with (.ui-light: white, or dark). */
const surface = (page: Page, testId: string) =>
  page
    .getByTestId(testId)
    .evaluate((el) =>
      (globalThis as unknown as Dom).getComputedStyle(el).getPropertyValue('--color-white'),
    );
const sidebarFg = (page: Page) =>
  page
    .getByTestId('shell')
    .evaluate((el) =>
      (globalThis as unknown as Dom).getComputedStyle(el).getPropertyValue('--sidebar-fg'),
    );

test('Settings → Appearance: Light and Dark switch the whole app, and are kept', async () => {
  const first = await launchOrbit({ colorScheme: null });
  const { userData } = first;
  try {
    const { app, win } = first;
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    const picker = settings.getByTestId('setting-appearance');
    await expect(picker.locator('[aria-checked="true"]')).toHaveAttribute('data-value', 'system');

    await picker.locator('[data-value="light"]').click();
    await expect(picker.locator('[aria-checked="true"]')).toHaveAttribute('data-value', 'light');
    await expect.poll(() => dark(win)).toBe(false);
    await expect.poll(() => dark(settings)).toBe(false);
    await expect.poll(() => sidebarFg(win)).toBe('rgb(29 29 31 / 1)'); // dark text: light sidebar
    await expect.poll(() => surface(settings, 'settings-page')).toBe('#fff');

    await picker.locator('[data-value="dark"]').click();
    await expect.poll(() => dark(win)).toBe(true);
    await expect.poll(() => sidebarFg(win)).toBe('rgb(242 242 247 / 1)');
    await expect.poll(() => surface(settings, 'settings-page')).toBe('#1f1f23');
    // The overlay's glass follows too (it's drawn dark; light mode mirrors it).
    await win.evaluate(() =>
      (
        globalThis as unknown as { orbit: { invoke: (c: string, i: unknown) => Promise<unknown> } }
      ).orbit.invoke('commandbar:open', { mode: 'new' }),
    );
    const overlay = await pageWith(app, '/overlay/');
    await expect.poll(() => dark(overlay)).toBe(true);
    await overlay.keyboard.press('Escape');

    await picker.locator('[data-value="light"]').click();
    await expect.poll(() => dark(overlay)).toBe(false);
    await expect
      .poll(() =>
        overlay.evaluate(() => {
          const w = globalThis as unknown as Dom;
          return w.getComputedStyle(w.document.documentElement).getPropertyValue('--color-white');
        }),
      )
      .toBe('#0b0b0d'); // glass text is near-black on light glass
  } finally {
    await first.close({ keepData: true });
  }

  // Kept across a restart, before the first frame.
  const second = await launchOrbit({ userData, colorScheme: null });
  try {
    expect(await dark(second.win)).toBe(false);
    expect(await sidebarFg(second.win)).toBe('rgb(29 29 31 / 1)');
  } finally {
    await second.close();
  }
});
