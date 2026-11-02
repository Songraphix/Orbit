import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
/** The overlay view's bounds (it shrinks to a lone tooltip, so clicks elsewhere still land). */
const overlayBounds = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 1)!;
    const overlay = win.contentView.children.at(-1)!;
    return { ...overlay.getBounds(), visible: overlay.getVisible() };
  });

test('Arc-style tooltips: label and key caps, quick to follow, never in the way', async () => {
  const server = await startTestServer();
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    const bar = await pageWith(app, '/overlay/');

    await win.getByTestId('address-copy').hover();
    const tip = bar.getByTestId('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Copy Link');
    await expect(tip.locator('kbd')).toHaveText(['⇧', '⌘', 'C']);
    // Alone, the overlay is only the tooltip's box (the page keeps its clicks).
    const bounds = await overlayBounds(app);
    expect(bounds.visible).toBe(true);
    expect(bounds.width).toBeLessThan(260);
    expect(bounds.height).toBe(30);

    // Moving to another control shows its tooltip straight away.
    await win.getByTestId('toolbar-reload').hover();
    await expect(tip).toContainText('Reload');
    await expect(tip.locator('kbd')).toHaveText(['⌘', 'R']);

    // Leaving hides it, and the overlay goes.
    await win.mouse.move(700, 500);
    await expect(tip).toHaveCount(0);
    await expect.poll(async () => (await overlayBounds(app)).visible).toBe(false);

    // Pressing a control hides its tooltip.
    await win.getByTestId('toolbar-reload').hover();
    await expect(tip).toBeVisible();
    await win.getByTestId('toolbar-reload').click();
    await expect(tip).toHaveCount(0);
  } finally {
    await orbit.close();
    await server.close();
  }
});

test('the Library: coloured, moving icons; Downloads filter and where files came from', async () => {
  const server = await startTestServer();
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await pageWith(app, '/one');
    await app.evaluate(
      ({ webContents }, urls) => {
        const page = webContents.getAllWebContents().find((w) => w.getURL().includes('/one'))!;
        for (const u of urls) page.downloadURL(u);
      },
      [server.url('/report.txt'), server.url('/icon.png')],
    );
    await expect(win.getByTestId('download-item')).toHaveCount(2);

    await invoke(win, 'library:open', { section: 'downloads' });
    const downloads = win.locator('[data-testid="library-section"][data-section="downloads"]');
    await expect(downloads).toHaveAttribute('aria-current', 'page');
    await expect(downloads.locator('svg')).toHaveAttribute('data-active', 'true');
    await expect(
      win.locator('[data-testid="library-section"][data-section="media"] svg'),
    ).toHaveAttribute('data-active', 'false');

    const lib = await pageWith(app, '#/library/downloads');
    await expect(lib.getByTestId('download-subtitle')).toHaveText([
      /from 127\.0\.0\.1/,
      /from 127\.0\.0\.1/,
    ]);
    await lib.getByTestId('downloads-filter').click();
    await lib.locator('[data-testid="downloads-filter-option"][data-filter="images"]').click();
    await expect(lib.getByTestId('download-entry')).toHaveCount(1);
    await expect(lib.getByTestId('download-entry')).toContainText('icon.png');
    await expect(lib.getByTestId('downloads-filter')).toHaveText('Images');
    await lib.getByTestId('downloads-filter').click();
    await lib.locator('[data-testid="downloads-filter-option"][data-filter="all"]').click();
    await expect(lib.getByTestId('download-entry')).toHaveCount(2);
  } finally {
    await orbit.close();
    await server.close();
  }
});

test('Orbit’s own pages get the same tooltips: the panel’s tabs, placed over the panel', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    const bar = await pageWith(app, '/overlay/');
    await panel.locator('[data-testid="panel-tab"][data-tab="assistant"]').hover();
    const tip = bar.getByTestId('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Assistant');
    await expect(tip.locator('kbd')).toHaveText(['⌘', 'J']);
    // It sits over the panel (on the right of the window), not at the window's left edge.
    const bounds = await overlayBounds(app);
    const width = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentSize()[0]!,
    );
    expect(bounds.x).toBeGreaterThan(width / 2);

    // The panel's colours load with it (not only with the note editor): the open tab is filled
    // with the accent, and a form's sheet is opaque.
    const fill = (selector: string) =>
      panel.locator(selector).evaluate(
        (el) =>
          (
            globalThis as unknown as {
              getComputedStyle: (e: unknown) => { backgroundColor: string };
            }
          ).getComputedStyle(el).backgroundColor,
      );
    expect(await fill('[data-testid="panel-tab"][aria-current="page"]')).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    await panel.getByTestId('new-project').click();
    expect(await fill('[data-testid="project-form"]')).toMatch(/^rgb\(/);
  } finally {
    await orbit.close();
  }
});
