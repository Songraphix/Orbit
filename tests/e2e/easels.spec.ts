import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
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
const invoke = <T = unknown>(page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );

async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
async function overlay(app: ElectronApplication): Promise<Page> {
  return pageWith(app, '/overlay/');
}

type Scene = { elements: { type: string; isDeleted?: boolean; link?: string | null }[] };
const easelId = (easel: Page) => easel.url().split('#/easel/')[1]!;
const savedScene = async (easel: Page): Promise<Scene | null> => {
  const data = await invoke<{ scene: string } | null>(easel, 'easels:get', { id: easelId(easel) });
  return data?.scene ? (JSON.parse(data.scene) as Scene) : null;
};
const savedTypes = async (easel: Page) =>
  ((await savedScene(easel))?.elements ?? []).filter((e) => !e.isDeleted).map((e) => e.type);

test('Easels: ⌃⇧E, draw, rename, capture from a page, reopen from the Library', async () => {
  const { app, win } = orbit;
  const pageUrl = server.url('/boost');
  await invoke(win, 'tabs:create', { url: pageUrl });
  await expect(win.getByTestId('toolbar-address')).toContainText('Boost Me');

  // ⌃⇧E: a new Easel opens as a tab.
  await clickMenu(app, 'new-easel');
  const easel = await pageWith(app, '#/easel/');
  const problems: string[] = [];
  easel.on('console', (m) => {
    // Excalidraw's CDN fallbacks are refused by the CSP by design; anything else is a problem.
    if (m.type() === 'error' && !/esm\.sh.*Content Security Policy/s.test(m.text()))
      problems.push(m.text());
  });
  await expect(easel.locator('.excalidraw')).toBeVisible({ timeout: 15_000 });
  await expect(easel.getByTestId('easel-title')).toHaveValue('Untitled Easel');

  // Draw a rectangle; it's saved by itself.
  await easel.locator('.excalidraw').click({ position: { x: 600, y: 400 } });
  await easel.keyboard.press('r');
  await easel.mouse.move(400, 300);
  await easel.mouse.down();
  await easel.mouse.move(560, 420, { steps: 5 });
  await easel.mouse.up();
  await expect.poll(() => savedTypes(easel), { timeout: 10_000 }).toEqual(['rectangle']);

  // Text uses Excalidraw's hand-drawn font, served by Orbit itself (no CDN, no CSP errors).
  await easel.mouse.dblclick(800, 500);
  await easel.keyboard.type('hello');
  await easel.keyboard.press('Escape');
  const fontStatus = () =>
    easel.evaluate(() => {
      type Face = { family: string; status: string };
      const page = globalThis as unknown as { document: { fonts: Iterable<Face> } };
      const faces = [...page.document.fonts];
      return {
        excalifont: faces.some((f) => f.family === 'Excalifont' && f.status === 'loaded'),
        failed: faces.filter((f) => f.status === 'error').map((f) => f.family),
      };
    });
  await expect.poll(fontStatus, { timeout: 10_000 }).toEqual({ excalifont: true, failed: [] });
  await expect.poll(() => savedTypes(easel), { timeout: 10_000 }).toEqual(['rectangle', 'text']);
  expect(problems).toEqual([]);

  // Renaming it renames the tab.
  await easel.getByTestId('easel-title').fill('Ideas');
  await easel.getByTestId('easel-title').press('Enter');
  await expect(win.locator('[data-testid="tab-row"]', { hasText: 'Ideas' })).toBeVisible();

  // Capture: the page comes up with the area-capture overlay; the image lands on the Easel,
  // linked to the page it came from.
  await easel.getByTestId('easel-capture').click();
  await expect(win.getByTestId('toolbar-address')).toContainText('Boost Me');
  const bar = await overlay(app);
  await expect(bar.getByTestId('capture-layer')).toBeVisible();
  await invoke(bar, 'capture:take', { rect: null });
  await expect(win.getByTestId('toolbar-address')).toContainText('Ideas');
  await expect
    .poll(() => savedTypes(easel), { timeout: 10_000 })
    .toEqual(['rectangle', 'text', 'image']);
  const image = (await savedScene(easel))!.elements.find((e) => e.type === 'image')!;
  expect(image.link).toBe(pageUrl);

  // Close it; Library → Easels lists it with a preview, and reopens it as it was.
  await clickMenu(app, 'close-tab');
  await win.getByTestId('library-button').click();
  await win.locator('[data-testid="library-section"][data-section="easels"]').click();
  const library = await pageWith(app, '#/library/');
  const entry = library.getByTestId('easel-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Ideas');
  await expect(entry.locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await entry.locator('button').first().click();
  await expect(win.getByTestId('library-nav')).toBeVisible(); // the Easel opens beside the Library
  const reopened = await pageWith(app, '#/easel/');
  await expect(reopened.locator('.excalidraw')).toBeVisible({ timeout: 15_000 });
  await expect(reopened.getByTestId('easel-title')).toHaveValue('Ideas');
  expect(await savedTypes(reopened)).toEqual(['rectangle', 'text', 'image']);
});
