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
    // The glass follows the wallpaper by default; with that off, Light and Dark decide it.
    await settings.getByTestId('ui-palette').click();
    await expect(settings.getByTestId('ui-palette')).not.toBeChecked();

    await picker.locator('[data-value="light"]').click();
    await expect(picker.locator('[aria-checked="true"]')).toHaveAttribute('data-value', 'light');
    await expect.poll(() => dark(win)).toBe(false);
    await expect.poll(() => dark(settings)).toBe(false);
    await expect.poll(() => sidebarFg(win)).toBe('rgb(24 26 32 / 1)'); // dark text: light glass
    await expect.poll(() => surface(settings, 'settings-page')).toBe('#fff');

    await picker.locator('[data-value="dark"]').click();
    await expect.poll(() => dark(win)).toBe(true);
    await expect.poll(() => sidebarFg(win)).toBe('rgb(246 247 250 / 1)');
    // Settings sits on the wallpaper: dark surfaces tinted by it (no longer plain white).
    await expect.poll(() => surface(settings, 'settings-page')).not.toBe('#fff');
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

  // The sidebar's sun/moon button flips it too (light → dark here), and is kept.
  // (Done in the restarted app below.)
  // Kept across a restart, before the first frame.
  const second = await launchOrbit({ userData, colorScheme: null });
  try {
    expect(await dark(second.win)).toBe(false);
    await expect.poll(() => sidebarFg(second.win)).toBe('rgb(24 26 32 / 1)');
    const toggle = second.win.getByTestId('appearance-toggle');
    await expect(toggle).toHaveAttribute('data-mode', 'light');
    await toggle.click();
    await expect.poll(() => dark(second.win)).toBe(true);
    await expect(toggle).toHaveAttribute('data-mode', 'dark');
  } finally {
    await second.close();
  }
});

test('Settings → Appearance: accent, density, text size, surfaces, motion and what shows — kept', async () => {
  const first = await launchOrbit();
  const { userData } = first;
  const rootClass = (page: Page) =>
    page.evaluate(
      () =>
        (
          (globalThis as unknown as Dom).document.documentElement as unknown as {
            className: string;
          }
        ).className,
    );
  const cssVar = (page: Page, name: string) =>
    page.evaluate((n) => {
      const w = globalThis as unknown as Dom;
      return w.getComputedStyle(w.document.documentElement).getPropertyValue(n);
    }, name);
  try {
    const { app, win } = first;
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="appearance"]').click();
    await expect(settings.getByTestId('settings-section-description').nth(1)).toBeVisible();

    // Hide Tasks and Orbit AI: their sidebar row and toolbar button go; the data stays.
    await expect(win.getByTestId('workspace-nav')).toContainText('Tasks');
    await settings.getByTestId('ui-show-tasks').uncheck();
    await expect(win.getByTestId('workspace-nav')).not.toContainText('Tasks');
    await expect(win.getByTestId('workspace-nav')).toContainText('Projects');
    await settings.getByTestId('ui-show-focus').uncheck();
    await expect(win.getByTestId('toolbar-focus')).toHaveCount(0);

    // Density: sidebar rows get roomier.
    await settings.locator('[data-testid="ui-density"] [data-value="spacious"]').click();
    await expect.poll(() => cssVar(win, '--row-h')).toBe('38px');

    // Accent: Orbit's pages and the shell take it.
    await settings.locator('[data-testid="ui-accent"] [data-value="#0f9488"]').click();
    await expect.poll(() => cssVar(settings, '--accent-fill')).toBe('#0f9488');
    await expect
      .poll(() =>
        win
          .getByTestId('shell')
          .evaluate((el) =>
            (globalThis as unknown as Dom).getComputedStyle(el).getPropertyValue('--accent'),
          ),
      )
      .toBe('#0f9488');

    // Text size scales Orbit's pages; solid surfaces and reduced motion reach every renderer.
    await settings.locator('[data-testid="ui-text-size"] [data-value="large"]').click();
    await expect
      .poll(() =>
        settings.evaluate(
          () =>
            (
              (globalThis as unknown as Dom).document.documentElement as unknown as {
                style: { zoom: string };
              }
            ).style.zoom,
        ),
      )
      .toBe('1.1');
    await settings.locator('[data-testid="ui-surfaces"] [data-value="solid"]').click();
    await settings.getByTestId('ui-reduce-motion').check();
    await expect.poll(() => rootClass(win)).toContain('surfaces-solid');
    await expect.poll(() => rootClass(win)).toContain('motion-reduced');
    await expect(win.getByTestId('shell')).toHaveAttribute('data-surfaces', 'solid');
  } finally {
    await first.close({ keepData: true });
  }

  // All of it after a restart.
  const second = await launchOrbit({ userData });
  try {
    const { win } = second;
    await expect(win.getByTestId('workspace-nav')).not.toContainText('Tasks');
    await expect(win.getByTestId('toolbar-focus')).toHaveCount(0);
    await expect.poll(() => cssVar(win, '--row-h')).toBe('38px');
    await expect(win.getByTestId('shell')).toHaveAttribute('data-surfaces', 'solid');
    await expect.poll(() => rootClass(win)).toContain('motion-reduced');
  } finally {
    await second.close();
  }
});

test('theme templates set a whole look; Comfortaa by default, and the font can be changed', async () => {
  const orbit = await launchOrbit({ colorScheme: null });
  const font = (page: Page) =>
    page.evaluate(() => {
      const w = globalThis as unknown as Dom;
      return w.getComputedStyle(w.document.documentElement).getPropertyValue('--font-ui');
    });
  try {
    const { app, win } = orbit;
    await expect.poll(() => font(win)).toContain('Comfortaa');

    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="appearance"]').click();
    const card = (id: string) =>
      settings.locator(`[data-testid="theme-template"][data-id="${id}"]`);
    await expect(card('orbit')).toHaveAttribute('aria-pressed', 'true');

    // Midnight: dark, violet, Inter — everywhere at once.
    await card('midnight').click();
    await expect(card('midnight')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => dark(win)).toBe(true);
    await expect.poll(() => font(win)).toContain('Inter');
    await expect.poll(() => font(settings)).toContain('Inter');

    // A tweak makes it your own look.
    await settings.locator('[data-testid="ui-font"] [data-value="serif"]').click();
    await expect.poll(() => font(win)).toContain('ui-serif');
    await expect(
      settings.locator('[data-testid="theme-template"][aria-pressed="true"]'),
    ).toHaveCount(0);

    // Back to Orbit.
    await card('orbit').click();
    await expect.poll(() => font(win)).toContain('Comfortaa');
  } finally {
    await orbit.close();
  }
});
