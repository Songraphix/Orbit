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
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

test('the toolbar camera (⇧⌘2) takes a screenshot, then asks what to do with it', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // The camera: drag an area (here: a click takes the whole page) → the card.
    await win.getByTestId('toolbar-screenshot').click();
    const bar = await overlay(app);
    await expect(bar.getByTestId('capture-layer')).toBeVisible();
    await invoke(bar, 'capture:take', { rect: null });
    await expect(bar.getByTestId('shot-card')).toBeVisible();
    await expect(bar.getByTestId('shot-preview')).toHaveAttribute('src', /^data:image\/png/);
    await expect(bar.getByTestId('shot-size')).toContainText('×');

    // Discard: nothing kept, nothing copied.
    await bar.getByTestId('shot-dismiss').click();
    await expect(bar.getByTestId('shot-card')).toHaveCount(0);

    // ⇧⌘2 → Open in Easel: a new Easel tab with the picture.
    await clickMenu(app, 'screenshot');
    await expect(bar.getByTestId('capture-layer')).toBeVisible();
    await invoke(bar, 'capture:take', { rect: null });
    await bar.getByTestId('shot-easel').click();
    await expect(win.locator('[aria-current="page"]')).toContainText('Notes on Page One');

    // Again → Copy (the clipboard has the picture).
    await win.locator('[data-testid="tab-row"]', { hasText: /^Page One$/ }).click();
    await win.getByTestId('toolbar-screenshot').click();
    await invoke(bar, 'capture:take', { rect: null });
    await bar.getByTestId('shot-copy').click();
    await expect(win.getByTestId('toolbar-toast')).toContainText('Screenshot copied');
    const types = await app.evaluate(async ({ clipboard }) => {
      const [item] = await clipboard.read();
      return item ? [...item.types] : [];
    });
    expect(types).toContain('image/png');
  } finally {
    await orbit.close();
  }
});
