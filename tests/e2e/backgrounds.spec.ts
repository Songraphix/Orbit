import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import { startTestServer } from './test-server';

async function homepage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/newtab'))).toBe(true);
  const page = app
    .windows()
    .filter((p) => p.url().includes('#/newtab'))
    .at(-1)!;
  await page.getByTestId('newtab').waitFor();
  return page;
}
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
const key = (page: Page) => page.getByTestId('wallpaper').getAttribute('data-key');

test('backgrounds: preview and cancel, colours, gradients, adjustments, favourites, rotation, Unsplash', async () => {
  test.setTimeout(120_000);
  const server = await startTestServer();
  const env = { ORBIT_UNSPLASH_API_URL: server.url('/unsplash'), ORBIT_TEST_PLAIN_KEYS: '1' };
  const first = await launchOrbit({ env });
  const { userData } = first;
  try {
    const { app, win } = first;
    const page = await homepage(app);
    await page.getByTestId('customize-button').click();

    // A colour previews; Cancel goes back to Misty Sunrise.
    await page.locator('[data-testid="background-tab"][data-tab="colour"]').click();
    await page.getByTestId('background-color').nth(3).click();
    expect(await key(page)).toBe('color:#2b1b4a');
    await page.getByTestId('background-cancel').click();
    expect(await key(page)).toBe('builtin:misty-sunrise');

    // A gradient, applied and made a favourite; then Dune as a second favourite.
    await page.locator('[data-testid="background-tab"][data-tab="gradient"]').click();
    await page.getByTestId('background-gradient').first().click();
    await page.getByTestId('background-apply').click();
    expect(await key(page)).toBe('gradient:#4f46e5:#ec4899:135');
    await page.getByTestId('background-favorite-toggle').click();
    await expect(page.getByTestId('background-favorite-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('[data-testid="background-tab"][data-tab="gallery"]').click();
    await page.getByTestId('wallpaper-dune').click();
    await page.getByTestId('background-apply').click();
    await page.getByTestId('background-favorite-toggle').click();
    await expect(page.getByTestId('background-favorite')).toHaveCount(2);

    // Adjustments: darker and blurred, kept.
    await page.getByTestId('background-adjust').locator('summary').click();
    await page.getByTestId('look-brightness').fill('70');
    // Blur is a plain switch (owner request); its amount shows once it's on.
    await expect(page.getByTestId('look-blur')).toHaveCount(0);
    await page.getByTestId('look-blur-toggle').check();
    await page.getByTestId('look-blur').fill('8');
    await expect(page.getByTestId('wallpaper-image')).toHaveCSS(
      'filter',
      'brightness(0.7) blur(8px)',
    );

    // Unsplash: needs the key first.
    await page.locator('[data-testid="background-tab"][data-tab="unsplash"]').click();
    await expect(page.getByTestId('unsplash-needs-key')).toBeVisible();
    await clickMenu(app, 'settings');
    await expect.poll(() => app.windows().some((p) => p.url().includes('#/settings'))).toBe(true);
    const settings = app.windows().find((p) => p.url().includes('#/settings'))!;
    await settings.locator('[data-testid="settings-nav"][data-section="integrations"]').click();
    await settings.getByTestId('unsplash-key').fill('not a key');
    await settings.getByTestId('unsplash-key-save').click();
    await expect(settings.getByTestId('unsplash-key-error')).toBeVisible();
    await settings.getByTestId('unsplash-key').fill('test_unsplash_key_0123456789');
    await settings.getByTestId('unsplash-key-save').click();
    await expect(settings.getByTestId('unsplash-key-remove')).toBeVisible();
    await closeSettings(app);

    // A new Homepage: search, preview, apply; the photographer is credited, Unsplash is told.
    await win.getByTestId('new-tab-row').click();
    const newTabs = () => app.windows().filter((p) => p.url().includes('#/newtab'));
    await expect.poll(() => newTabs().length).toBe(2);
    const second = newTabs().find((p) => p !== page)!;
    await second.getByTestId('newtab').waitFor();
    await second.getByTestId('customize-button').click();
    await second.locator('[data-testid="background-tab"][data-tab="unsplash"]').click();
    await second.getByTestId('unsplash-query').fill('mountains');
    await second.getByTestId('unsplash-search').click();
    await expect(second.getByTestId('unsplash-photo')).toHaveCount(2);
    await second.getByTestId('unsplash-photo').first().click();
    await expect(second.getByTestId('unsplash-credit')).toContainText('Photo by Ama on Unsplash');
    await second.getByTestId('background-apply').click();
    expect(await key(second)).toBe('unsplash:peak1');
    await expect.poll(() => server.unsplashDownloads()).toEqual(['peak1']);
    await expect(second.getByTestId('wallpaper-overlay')).toBeVisible(); // photos get a veil

    // Rotation: a new one each tab, from the favourites.
    await second.getByTestId('background-rotation').selectOption('every-tab');
  } finally {
    await first.close({ keepData: true });
  }

  const again = await launchOrbit({ userData, env });
  try {
    const keys = new Set<string>();
    const seen = new Set<Page>();
    for (let i = 0; i < 3; i++) {
      if (i > 0) await again.win.getByTestId('new-tab-row').click();
      const pages = () => again.app.windows().filter((p) => p.url().includes('#/newtab'));
      await expect.poll(() => pages().filter((p) => !seen.has(p)).length).toBeGreaterThan(0);
      const page = pages().find((p) => !seen.has(p))!;
      seen.add(page);
      await page.getByTestId('newtab').waitFor();
      await expect.poll(() => key(page)).not.toBe('');
      keys.add((await key(page))!);
      await expect(page.getByTestId('wallpaper-image')).toHaveCSS(
        'filter',
        'brightness(0.7) blur(8px)',
      );
    }
    // Only the two favourites, never the same twice in a row.
    expect([...keys].sort()).toEqual(['builtin:dune', 'gradient:#4f46e5:#ec4899:135']);
  } finally {
    await again.close();
    await server.close();
  }
});
