import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = <T = unknown>(win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
const player = (app: ElectronApplication) =>
  app.windows().filter((p) => p.url().includes('#/sounds')).length;
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

test('Focus & Sounds: a sound plays as you browse; focus blocks sites until it ends', async () => {
  const server = await startTestServer();
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    // The toolbar's Focus button opens the panel's Focus view.
    await win.getByTestId('toolbar-focus').click();
    const panel = await pageWith(app, '#/notes/panel/focus');
    await expect(panel.getByTestId('focus-setup')).toBeVisible();
    await expect(panel.getByTestId('sound')).toHaveCount(12);

    // A sound: the toolbar shows it playing; one hidden page plays it.
    await panel.locator('[data-testid="sound"][data-sound="rain"]').click();
    await expect(win.getByTestId('toolbar-playing')).toBeVisible();
    await expect.poll(() => player(app)).toBe(1);
    await panel.locator('[data-testid="sound"][data-sound="ocean"]').click(); // switch
    await expect(panel.locator('[data-testid="sound"][data-sound="ocean"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(player(app)).toBe(1);
    // Pause from the toolbar; the bars stop; resume.
    await win.getByTestId('toolbar-sound-pause').click();
    await expect(win.getByTestId('toolbar-playing')).toHaveCount(0);
    await expect(panel.getByTestId('sounds-pause')).toContainText('Resume');
    await panel.getByTestId('sounds-pause').click();
    await expect(win.getByTestId('toolbar-playing')).toBeVisible();
    await panel.getByTestId('sounds-volume').fill('0.3');
    await expect
      .poll(() => invoke<{ volume: number }>(win, 'sounds:get').then((s) => s.volume))
      .toBeCloseTo(0.3);

    // Focus for 15 minutes, blocking 127.0.0.1 (the test site) as a distraction.
    await panel.getByTestId('focus-edit-sites').click();
    await panel.getByTestId('focus-site-input').fill('127.0.0.1');
    await panel.getByTestId('focus-site-input').press('Enter');
    await expect(panel.getByTestId('focus-site').filter({ hasText: '127.0.0.1' })).toBeVisible();
    await panel.getByTestId('focus-block').check();
    await panel.locator('[data-testid="focus-minutes"][data-value="15"]').click();
    await panel.getByTestId('focus-start').click();
    await expect(panel.getByTestId('focus-session')).toBeVisible();
    await expect(panel.getByTestId('focus-clock')).toHaveText(/^1[45]:\d\d$/);
    await expect(win.getByTestId('focus-pill')).toBeVisible();

    // The blocked site shows Orbit's page instead; Open Anyway lets it through.
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    const blocked = await pageWith(app, '#/blocked/');
    await expect(blocked.getByTestId('blocked-page')).toContainText('127.0.0.1');
    await blocked.getByTestId('blocked-open').click();
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // Pause stops the clock; a break never blocks; ending the break stops the sound.
    await panel.getByTestId('focus-pause').click();
    await expect(win.getByTestId('focus-pill-pause')).toHaveAttribute('aria-label', 'Resume');
    await expect(panel.getByTestId('focus-pause')).toContainText('Resume');
    const pausedAt = await panel.getByTestId('focus-clock').textContent();
    await new Promise((r) => setTimeout(r, 1500));
    await expect(panel.getByTestId('focus-clock')).toHaveText(pausedAt!);
    await invoke(win, 'focus:start', { kind: 'break' });
    await expect(win.getByTestId('focus-pill')).toHaveAttribute('data-kind', 'break');
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
    await panel.getByTestId('focus-end').click();
    await expect(panel.getByTestId('focus-setup')).toBeVisible();
    await expect(win.getByTestId('toolbar-playing')).toHaveCount(0);
    await expect.poll(() => player(app), { timeout: 8_000 }).toBe(0); // faded out, then closed

    // ⌘T: "Play Brown Noise", and the menu's Focus & Sounds.
    await clickMenu(app, 'focus-open');
    await invoke(win, 'commandbar:open', { mode: 'new' });
    const bar = await pageWith(app, '/overlay/');
    await bar.keyboard.type('brown noise');
    const play = bar.getByTestId('command-item').filter({ hasText: 'Play Brown Noise' });
    await play.click();
    await expect(win.getByTestId('toolbar-playing')).toBeVisible();
  } finally {
    await orbit.close();
    await server.close();
  }
});
