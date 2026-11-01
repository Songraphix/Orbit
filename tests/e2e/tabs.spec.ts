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

type Snapshot = {
  tabs: { id: string; title: string; url: string; kind: string; favicon: string | null }[];
  activeTabId: string | null;
};
type Rect = { x: number; y: number; width: number; height: number };

/** Calls window.orbit.invoke from the shell. */
function invoke<T>(win: Page, channel: string, input: unknown = {}): Promise<T> {
  return win.evaluate(
    ([c, i]) =>
      (
        globalThis as unknown as { orbit: { invoke: (c: string, i: unknown) => Promise<unknown> } }
      ).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
}

/** Bounds of every visible tab view, read from the native view tree. */
function visibleViewBounds(app: ElectronApplication): Promise<Rect[]> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!
      .contentView.children.filter((v) => v.getVisible())
      .map((v) => v.getBounds()),
  );
}

/** Runs JavaScript inside the tab whose URL contains `fragment`. */
function inTab(app: ElectronApplication, fragment: string, code: string): Promise<unknown> {
  return app.evaluate(
    ({ webContents }, [f, c]) => {
      const target = webContents.getAllWebContents().find((w) => w.getURL().includes(f));
      if (!target) throw new Error(`no tab with ${f}`);
      return target.executeJavaScript(c);
    },
    [fragment, code] as const,
  );
}

test('opens with a new tab page as the only tab', async () => {
  const { win } = orbit;
  await expect(win.getByTestId('tab-row')).toHaveCount(1);
  await expect(win.getByTestId('tab-row')).toHaveText('New Tab');
  await expect(win.getByTestId('tab-row')).toHaveAttribute('aria-current', 'page');
});

test('loads a page in a tab with title and favicon, placed exactly in the layout', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });

  await expect(win.getByTestId('tab-row')).toHaveCount(2);
  const active = win.locator('[data-testid="tab-row"][aria-current="page"]');
  await expect(active).toHaveText('Page One');
  await expect(active.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);

  // Exactly one view is visible, and it sits where main's layout says the web view goes.
  const layout = await invoke<{ webView: Rect }>(win, 'layout:get');
  await expect.poll(() => visibleViewBounds(app)).toEqual([layout.webView]);

  // Hiding the sidebar moves the web view with the card.
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.getMenuItemById('toggle-sidebar')!.click(),
  );
  await expect.poll(async () => (await visibleViewBounds(app))[0]?.x).toBe(8);
});

test('web pages get no Orbit API and cannot reach main', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.locator('[aria-current="page"]')).toHaveText('Page One');

  const result = await inTab(app, '/one', 'typeof window.orbit + "|" + typeof require');
  expect(result).toBe('undefined|undefined');
});

test('switches, closes and reopens tabs; ⌘W closes the active tab', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await invoke(win, 'tabs:create', { url: server.url('/two') });
  const rows = win.getByTestId('tab-row');
  await expect(rows).toHaveText(['New Tab', 'Page One', 'Page Two']);

  // Click "Page One" to activate it.
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'page');

  // Close it with its × button: the tab below ("Page Two") becomes active.
  await rows.nth(1).hover();
  await rows.nth(1).getByTestId('tab-close').click();
  await expect(rows).toHaveText(['New Tab', 'Page Two']);
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'page');

  // ⌘W (File → Close Tab) closes the active tab; the one above takes over.
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.getMenuItemById('close-tab')!.click(),
  );
  await expect(rows).toHaveText(['New Tab']);
  await expect(rows.first()).toHaveAttribute('aria-current', 'page');

  // "+ New Tab" opens another new tab page.
  await win.getByTestId('new-tab-row').click();
  await expect(rows).toHaveText(['New Tab', 'New Tab']);
});

test('typed input is classified: domains load, words search', async () => {
  const { win } = orbit;
  await invoke(win, 'tabs:create', { url: '127.0.0.1:1/x' });
  await invoke(win, 'tabs:create', { url: 'what is arc' });
  const snap = await invoke<Snapshot>(win, 'tabs:get');
  const urls = snap.tabs.map((t) => t.url);
  expect(urls).toContain('http://127.0.0.1:1/x');
  expect(urls.some((u) => u.startsWith('https://www.google.com/search?q=what%20is%20arc'))).toBe(
    true,
  );
});

test('links with target=_blank open as a new tab', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await expect(win.locator('[aria-current="page"]')).toHaveText('Page One');

  await inTab(app, '/one', 'document.getElementById("popup").click()');
  await expect(win.getByTestId('tab-row')).toHaveText(['New Tab', 'Page One', 'Page Two']);
  // No extra native windows were created.
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});
