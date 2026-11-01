import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import type { Orbit } from './launch-orbit';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

let orbit: Orbit;
let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer();
  orbit = await launchOrbit();
});
test.afterEach(async () => {
  await orbit?.close();
  await server?.close();
});

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const openTab = (win: Page, url: string) =>
  win.evaluate(
    (u) =>
      (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:create', {
        url: u,
      }),
    url,
  );

test('a tab playing in the background gets a mini player: pause, mute, jump back, stop', async () => {
  const { app, win } = orbit;
  await openTab(win, server.url('/audio'));
  await expect(win.getByTestId('toolbar-address')).toContainText('Song');
  const page = app.windows().find((p) => p.url().includes('/audio'))!;
  await page.locator('#play').click();

  // While its tab is on screen there's no card; switch away and it appears.
  await expect(win.getByTestId('media-card')).toHaveCount(0);
  await openTab(win, server.url('/one'));
  const card = win.getByTestId('media-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-playing', 'true');
  await expect(win.getByTestId('media-title')).toContainText('Song');

  await win.getByTestId('media-toggle').click();
  await expect(card).toHaveAttribute('data-playing', 'false');
  expect(
    await page.evaluate(
      () =>
        (
          globalThis as unknown as { document: { getElementById(id: string): { paused: boolean } } }
        ).document.getElementById('a').paused,
    ),
  ).toBe(true);

  await win.getByTestId('media-mute').click();
  await expect(win.getByTestId('media-mute')).toHaveAttribute('aria-label', 'Unmute');

  // The title jumps back to the tab (and the card hides while it's on screen).
  await win.getByTestId('media-title').click();
  await expect(win.getByTestId('toolbar-address')).toContainText('Song');
  await expect(card).toHaveCount(0);

  // Play again, switch away, then × stops it and removes the card.
  await page.locator('#play').click();
  await win.locator('[data-testid="tab-row"]', { hasText: 'Page One' }).click();
  await expect(card).toBeVisible();
  await win.getByTestId('media-close').click();
  await expect(card).toHaveCount(0);
});
