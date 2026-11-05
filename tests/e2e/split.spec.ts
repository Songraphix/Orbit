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
const invoke = <T = unknown>(win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

/** Bounds of the visible native page views (the overlay is hidden unless open). */
const visibleViews = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 1)!;
    return win.contentView.children
      .filter((v) => v.getVisible())
      .map((v) => v.getBounds())
      .sort((a, b) => a.x - b.x);
  });

test('split view: two tabs side by side, focus, resize, swap, and leaving the split', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const one = await invoke<{ tabId: string }>(win, 'tabs:create', { url: server.url('/one') });
    const two = await invoke<{ tabId: string }>(win, 'tabs:create', { url: server.url('/two') });
    const cards = win.getByTestId('content-card');
    await expect(cards).toHaveCount(1);

    // Page Two (active) on the left, Page One joins on the right and takes focus.
    await invoke(win, 'split:create', { tabId: one.tabId });
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-tab-id', two.tabId);
    await expect(cards.nth(1)).toHaveAttribute('data-tab-id', one.tabId);
    await expect(cards.nth(1)).toHaveAttribute('data-focused', 'true');
    await expect(cards.nth(0).getByTestId('pane-title')).toContainText('Page Two');
    await expect(cards.nth(1).getByTestId('pane-title')).toContainText('Page One');
    // The toolbar row above follows the focused pane.
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // Both pages are on screen, each below its own header.
    await expect.poll(async () => (await visibleViews(app)).length).toBe(2);
    const [left, right] = await visibleViews(app);
    expect(Math.abs(left!.width - right!.width)).toBeLessThanOrEqual(1);
    expect(right!.x).toBeGreaterThan(left!.x + left!.width);

    // Clicking the left pane's header focuses it (and the toolbar follows).
    await cards.nth(0).getByTestId('pane-reload').click();
    await expect(cards.nth(0)).toHaveAttribute('data-focused', 'true');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');

    // Dragging the divider resizes the panes.
    const divider = await win.getByTestId('split-divider').boundingBox();
    const y = divider!.y + divider!.height / 2;
    await win.mouse.move(divider!.x + divider!.width / 2, y);
    await win.mouse.down();
    await win.mouse.move(divider!.x - 150, y, { steps: 5 });
    await win.mouse.up();
    await expect
      .poll(async () => (await visibleViews(app))[0]!.width)
      .toBeLessThan(left!.width - 100);

    // Swap puts Page One on the left.
    await cards.nth(0).getByTestId('split-swap').click();
    await expect(cards.nth(0)).toHaveAttribute('data-tab-id', one.tabId);

    // Opening any other tab leaves the split.
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await today.filter({ hasText: 'New Tab' }).click();
    await expect(cards).toHaveCount(1);
    await expect.poll(async () => (await visibleViews(app)).length).toBe(1);
  } finally {
    await orbit.close();
  }
});

test('⌃⇧= splits with a new tab page; closing a pane leaves its partner full width', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const one = await invoke<{ tabId: string }>(win, 'tabs:create', { url: server.url('/one') });
    const cards = win.getByTestId('content-card');

    await clickMenu(app, 'split-view');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-tab-id', one.tabId);
    await expect(cards.nth(1).getByTestId('pane-title')).toContainText('New Tab');

    // ⌘W closes the focused (new tab) pane; Page One fills the card again.
    await clickMenu(app, 'close-tab');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('data-tab-id', one.tabId);
    await expect.poll(async () => (await visibleViews(app)).length).toBe(1);

    // "Show This Page Alone" keeps the pane it was clicked in.
    await clickMenu(app, 'split-view');
    await expect(cards).toHaveCount(2);
    await cards.nth(0).getByTestId('split-exit').click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('data-tab-id', one.tabId);
  } finally {
    await orbit.close();
  }
});
