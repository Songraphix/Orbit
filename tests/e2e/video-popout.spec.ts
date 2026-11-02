import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer();
});
test.afterEach(async () => {
  await server?.close();
});

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const inVideo = (app: ElectronApplication, code: string) =>
  app.evaluate(
    ({ webContents }, c) =>
      webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes('/clip'))!
        .executeJavaScript(c, true),
    code,
  );
/** The pop-out window: is there one, is it on top, minimized? */
const popoutWindow = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow }) => {
    const win = BaseWindow.getAllWindows().find((w) => w.getTitle() === 'Video');
    return win ? { onTop: win.isAlwaysOnTop(), minimized: win.isMinimized() } : null;
  });
async function controls(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/popout'))).toBe(true);
  const page = app.windows().find((p) => p.url().includes('#/popout'))!;
  await page.getByTestId('popout-controls').waitFor();
  return page;
}
const lifted = (app: ElectronApplication) =>
  inVideo(
    app,
    'document.querySelector("video[data-orbit-popout]")?.matches(":popover-open") ?? false',
  );
const playing = (app: ElectronApplication) =>
  inVideo(app, '!(document.getElementById("v")?.paused ?? true)');

test('switching away from a playing video pops it out; minimize, back to video, close', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await invoke(win, 'tabs:create', { url: server.url('/clip') });
    await expect(today.first()).toHaveText('Clip');
    await expect.poll(() => playing(app)).toBe(true);

    // Another tab: the video carries on in its own floating window, filling it.
    await today.nth(1).click();
    let bar = await controls(app);
    await expect.poll(() => popoutWindow(app)).toEqual({ onTop: true, minimized: false });
    expect(await lifted(app)).toBe(true);
    expect(await playing(app)).toBe(true);
    await expect(win.getByTestId('media-card')).toHaveCount(0); // no second player

    // Play/pause from the pop-out.
    await bar.getByTestId('popout-toggle').click();
    await expect.poll(() => playing(app)).toBe(false);
    await bar.getByTestId('popout-toggle').click();
    await expect.poll(() => playing(app)).toBe(true);

    // − docks it in the sidebar like a music player: still playing, the mini player takes over,
    // with the site's own previous / next track.
    await bar.getByTestId('popout-minimize').click();
    await expect.poll(() => popoutWindow(app)).toBeNull();
    expect(await lifted(app)).toBe(false);
    expect(await playing(app)).toBe(true);
    const card = win.getByTestId('media-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('media-next')).toBeEnabled();
    await card.getByTestId('media-next').click();
    await card.getByTestId('media-previous').click();
    await expect.poll(() => inVideo(app, 'window.__tracks.join()')).toBe('next,previous');

    // Its pop-out button floats it again; then Back to Video.
    await card.getByTestId('media-popout').click();
    bar = await controls(app);
    await expect(card).toHaveCount(0);
    await bar.getByTestId('popout-back').click();
    await expect(win.locator('[aria-current="page"]')).toHaveText('Clip');
    await expect.poll(() => popoutWindow(app)).toBeNull();
    expect(await lifted(app)).toBe(false);
    expect(await playing(app)).toBe(true);

    // Out again, then Close: the video stops and goes home.
    await today.nth(1).click();
    bar = await controls(app);
    await bar.getByTestId('popout-close').click();
    await expect.poll(() => popoutWindow(app)).toBeNull();
    await expect.poll(() => playing(app)).toBe(false);
    expect(await lifted(app)).toBe(false);

    // Clicking the tab while it's out also brings it home.
    await inVideo(app, 'document.getElementById("v").play()');
    await today.first().click();
    await expect.poll(() => playing(app)).toBe(true);
    await today.nth(1).click();
    await controls(app);
    await today.first().click();
    await expect.poll(() => popoutWindow(app)).toBeNull();
    expect(await lifted(app)).toBe(false);
  } finally {
    await orbit.close();
  }
});
