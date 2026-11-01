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

async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

async function boostEditor(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/boost/'))).toBe(true);
  const editor = app.windows().find((p) => p.url().includes('#/boost/'))!;
  await editor.getByTestId('boost-editor').waitFor();
  return editor;
}

/** Runs code in the web page at `url` (its main world, like the page's own scripts). */
const pageEval = <T>(app: ElectronApplication, url: string, code: string) =>
  app.evaluate(
    ({ webContents }, [u, c]) =>
      webContents
        .getAllWebContents()
        .find((w) => w.getURL() === u)!
        .executeJavaScript(c),
    [url, code] as const,
  ) as Promise<T>;

/** Real input events into the page (what a user's mouse and keyboard would send). */
const sendInput = (app: ElectronApplication, url: string, events: unknown[]) =>
  app.evaluate(
    ({ webContents }, [u, list]) => {
      const page = webContents.getAllWebContents().find((w) => w.getURL() === u)!;
      for (const event of list as Parameters<typeof page.sendInputEvent>[0][])
        page.sendInputEvent(event);
    },
    [url, events] as const,
  );

const h1Color = (app: ElectronApplication, url: string) =>
  pageEval<string>(app, url, 'getComputedStyle(document.querySelector("h1")).color');

test('a Boost from site controls: editor beside the page, live CSS and colours, JS, toggle', async () => {
  const { app, win } = orbit;
  const url = server.url('/boost');
  const page = await invoke<{ tabId: string }>(win, 'tabs:create', { url });
  await expect(win.getByTestId('toolbar-address')).toContainText('Boost Me');
  const plain = await h1Color(app, url);

  // "Boost" in site controls opens a new Boost's editor beside the page.
  await win.getByTestId('toolbar-site-controls').click();
  const bar = await overlay(app);
  await bar.getByTestId('site-boost').click();
  const editor = await boostEditor(app);
  await expect(win.getByTestId('content-card')).toHaveCount(2);
  await expect(editor.getByTestId('boost-name')).toHaveValue('Boost for 127.0.0.1');
  await expect(editor.getByTestId('boost-domain')).toHaveValue('127.0.0.1');

  // CSS applies as you type.
  await editor
    .locator('[data-testid="boost-code-css"] .cm-content')
    .fill('h1 { color: rgb(255, 0, 0) }');
  await expect.poll(() => h1Color(app, url)).toBe('rgb(255, 0, 0)');

  // Colour tool: Dark inverts the page.
  await editor.getByTestId('boost-dark').click();
  await expect
    .poll(() => pageEval<string>(app, url, 'getComputedStyle(document.documentElement).filter'))
    .toContain('invert(1)');

  // JS runs when matching pages load (in its own world, but on the same page).
  await editor.getByTestId('boost-tab-js').click();
  await editor
    .locator('[data-testid="boost-code-js"] .cm-content')
    .fill('document.body.dataset.boosted = "yes"');
  await editor.getByTestId('boost-reload').click();
  await expect
    .poll(() => pageEval<string | undefined>(app, url, 'document.body.dataset.boosted'))
    .toBe('yes');
  await expect.poll(() => h1Color(app, url)).toBe('rgb(255, 0, 0)'); // CSS survives a reload

  // Site controls lists the Boost; its switch turns it off live.
  await invoke(win, 'tabs:activate', { tabId: page.tabId });
  await win.getByTestId('content-card').nth(0).getByTestId('toolbar-site-controls').click();
  const row = bar.getByTestId('site-boost-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Boost for 127.0.0.1');
  await row.getByTestId('site-boost-toggle').click();
  await expect(row).toHaveAttribute('data-enabled', 'false');
  await expect.poll(() => h1Color(app, url)).toBe(plain);
  await expect
    .poll(() => pageEval<string>(app, url, 'getComputedStyle(document.documentElement).filter'))
    .toBe('none');

  // A bad website address is refused with a message.
  await editor.getByTestId('boost-domain').fill('not a site');
  await editor.getByTestId('boost-domain').press('Enter');
  await expect(editor.getByTestId('boost-error')).toContainText('isn’t a website address');
});

test('zap: click elements to hide them, Esc to finish; the editor can bring them back', async () => {
  const { app, win } = orbit;
  const url = server.url('/boost');
  await invoke(win, 'tabs:create', { url });
  await expect(win.getByTestId('toolbar-address')).toContainText('Boost Me');

  await win.getByTestId('toolbar-site-controls').click();
  const bar = await overlay(app);
  await bar.getByTestId('site-zap').click();
  const hint = 'document.body.parentElement.innerText.includes("Click an element to zap it")';
  await expect.poll(() => pageEval<boolean>(app, url, hint)).toBe(true);

  // Click the banner.
  const [x, y] = await pageEval<[number, number]>(
    app,
    url,
    '(() => { const r = document.getElementById("banner").getBoundingClientRect(); return [Math.round(r.x + 20), Math.round(r.y + 20)]; })()',
  );
  await sendInput(app, url, [
    { type: 'mouseMove', x, y },
    { type: 'mouseDown', x, y, button: 'left', clickCount: 1 },
    { type: 'mouseUp', x, y, button: 'left', clickCount: 1 },
  ]);
  const bannerDisplay = 'getComputedStyle(document.getElementById("banner")).display';
  await expect.poll(() => pageEval<string>(app, url, bannerDisplay)).toBe('none');

  // Zapping continues until Esc.
  await expect.poll(() => pageEval<boolean>(app, url, hint)).toBe(true);
  await sendInput(app, url, [{ type: 'keyDown', keyCode: 'Escape' }]);
  await expect.poll(() => pageEval<boolean>(app, url, hint)).toBe(false);
  await expect(win.getByTestId('toolbar-toast')).toContainText('Zapped 1 element');

  // The zap went into a Boost for this site; its editor lists and restores it.
  await win.getByTestId('toolbar-site-controls').click();
  await bar.getByTestId('site-boost-edit').click();
  const editor = await boostEditor(app);
  const zapped = editor.getByTestId('boost-zapped');
  await expect(zapped).toHaveCount(1);
  await expect(zapped).toContainText('#banner');
  await zapped.getByTestId('boost-unzap').click();
  await expect.poll(() => pageEval<string>(app, url, bannerDisplay)).toBe('block');
});
