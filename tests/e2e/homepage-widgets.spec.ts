import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

/** The newest new tab page. */
async function homepage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/newtab'))).toBe(true);
  const page = app
    .windows()
    .filter((p) => p.url().includes('#/newtab'))
    .at(-1)!;
  await page.getByTestId('newtab').waitFor();
  return page;
}
const types = (page: Page) =>
  page
    .getByTestId('widget')
    .evaluateAll((els) =>
      els.map((e) => (e as unknown as { dataset: { type: string } }).dataset.type),
    );

test('Homepage widgets: add, set up, resize, reorder, remove, presets — kept after a restart', async () => {
  const server = await startTestServer();
  const env = {
    ORBIT_GEOCODE_URL: server.url('/geo/search'),
    ORBIT_FORECAST_URL: server.url('/forecast'),
  };
  const first = await launchOrbit({ env });
  const { userData } = first;
  try {
    const page = await homepage(first.app);
    // What it showed before: Today and the quote, now as widgets.
    expect(await types(page)).toEqual(['today', 'quote']);

    // Customize → Edit Widgets: the toolbar, then the gallery.
    await page.getByTestId('customize-button').click();
    await page.getByTestId('customize-edit-widgets').click();
    await expect(page.getByTestId('widgets-toolbar')).toBeVisible();
    for (const type of ['focus', 'countdown', 'weather', 'projects']) {
      await page.getByTestId('widgets-add').click();
      await page.locator(`[data-testid="gallery-item"][data-type="${type}"]`).click();
    }
    expect(await types(page)).toEqual([
      'today',
      'quote',
      'focus',
      'countdown',
      'weather',
      'projects',
    ]);

    // Countdown: a name and a date 10 days out.
    const date = await page.evaluate(() => {
      const d = new Date(Date.now() + 10 * 86_400_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    await page.getByTestId('countdown-title').fill('Launch');
    await page.getByTestId('countdown-date').fill(date);
    await page.getByTestId('countdown-save').click();
    await expect(page.getByTestId('countdown-days')).toHaveText('D-10');

    // Weather: find a city (only its name goes out), then today's weather.
    await page.getByTestId('weather-city').fill('Accra');
    await page.getByTestId('weather-city').press('Enter');
    await page.getByTestId('weather-place').first().click();
    await expect(page.getByTestId('weather-temp')).toHaveText('29°');
    await expect(page.getByTestId('weather-text')).toContainText('Partly cloudyH 31° · L 24°');

    // Projects: the samples' progress. Focus: start the existing timer from here.
    await expect(page.getByTestId('projects-widget-item').first()).toBeVisible();
    await page.getByTestId('focus-widget-start').click();
    await expect(first.win.getByTestId('focus-pill')).toBeVisible();
    await expect(page.getByTestId('focus-widget-pause')).toBeVisible();
    await page.getByTestId('focus-widget-end').click();
    await expect(first.win.getByTestId('focus-pill')).toHaveCount(0);

    // Resize the quote, drag the weather first, remove the projects.
    const quote = page.locator('[data-testid="widget"][data-type="quote"]');
    await quote.getByTestId('widget-size').click();
    await expect(quote).toHaveAttribute('data-size', 'l');
    await page
      .locator('[data-testid="widget"][data-type="weather"]')
      .dragTo(page.locator('[data-testid="widget"][data-type="today"]'));
    expect((await types(page))[0]).toBe('weather');
    await page
      .locator('[data-testid="widget"][data-type="projects"]')
      .getByTestId('widget-remove')
      .click();
    await page.getByTestId('widgets-done').click();
    await expect(page.getByTestId('widgets-toolbar')).toHaveCount(0);
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData, env });
  try {
    const page = await homepage(second.app);
    expect(await types(page)).toEqual(['weather', 'today', 'quote', 'focus', 'countdown']);
    await expect(page.locator('[data-testid="widget"][data-type="quote"]')).toHaveAttribute(
      'data-size',
      'l',
    );
    await expect(page.getByTestId('countdown-days')).toHaveText('D-10');
    await expect(page.getByTestId('weather-temp')).toHaveText('29°');

    // A preset replaces the layout; Minimal leaves an empty, inviting state.
    await page.getByTestId('customize-button').click();
    await page.getByTestId('customize-edit-widgets').click();
    await page.getByTestId('widgets-preset').selectOption('developer');
    expect(await types(page)).toEqual(['today', 'focus', 'recent', 'clocks', 'stopwatch']);
    await expect(page.getByTestId('world-clock')).toHaveCount(3);
    await page.getByTestId('widgets-preset').selectOption('minimal');
    await page.getByTestId('widgets-done').click();
    await expect(page.getByTestId('widgets-empty')).toBeVisible();
  } finally {
    await second.close();
    await server.close();
  }
});
