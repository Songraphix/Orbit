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
  // The test server's own port stands in for a local development server.
  const port = new URL(server.url('/')).port;
  orbit = await launchOrbit({ env: { ORBIT_TEST_DEV_PORTS: port } });
});
test.afterEach(async () => {
  await orbit?.close();
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
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
/** The page's view on screen (window coordinates). */
const viewBounds = (app: ElectronApplication, fragment: string) =>
  app.evaluate(({ BrowserWindow }, f) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 1)!;
    const view = win.contentView.children.find((v) =>
      (v as unknown as { webContents?: { getURL(): string } }).webContents?.getURL().includes(f),
    )!;
    return view.getBounds();
  }, fragment);

/** Right-clicks the page and picks `label` from Orbit's menu (the native menu isn't shown). */
const rightClickAndPick = (
  app: ElectronApplication,
  fragment: string,
  params: Record<string, unknown>,
  label: string,
) =>
  app.evaluate(
    ({ Menu, webContents }, [f, p, l]) => {
      let picked = false;
      const original = Menu.buildFromTemplate;
      Menu.buildFromTemplate = ((template: { label?: string; click?: () => void }[]) => {
        Menu.buildFromTemplate = original;
        const item = template.find((i) => i.label === l);
        item?.click?.();
        picked = item !== undefined;
        return { popup: () => undefined };
      }) as never;
      const page = webContents.getAllWebContents().find((w) => w.getURL().includes(f))!;
      page.emit(
        'context-menu',
        { preventDefault: () => undefined },
        {
          x: 10,
          y: 10,
          linkURL: '',
          linkText: '',
          srcURL: '',
          altText: '',
          mediaType: 'none',
          selectionText: '',
          isEditable: false,
          misspelledWord: '',
          dictionarySuggestions: [],
          editFlags: {
            canUndo: false,
            canRedo: false,
            canCut: false,
            canCopy: true,
            canPaste: false,
            canSelectAll: true,
          },
          ...p,
        },
      );
      return picked;
    },
    [fragment, params, label] as const,
  );

test('Toolkit: pick a colour, the page’s palette, contrast, JSON and image info', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/colors') });
  await pageWith(app, '/colors');

  // Pick Color (⌃⇧C): the page under a loupe; a click copies the colour.
  await clickMenu(app, 'pick-color');
  const bar = await pageWith(app, '/overlay/');
  await expect(bar.getByTestId('color-pick-layer')).toBeVisible();
  const bounds = await viewBounds(app, '/colors');
  const spot = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 60 };
  await bar.mouse.move(spot.x, spot.y);
  await expect(bar.getByTestId('color-pick-hex')).toHaveText('#5b5bd6');
  await bar.mouse.click(spot.x, spot.y);
  await expect(win.getByTestId('toolbar-toast')).toContainText('Copied #5b5bd6');
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('#5b5bd6');
  await expect(bar.getByTestId('color-pick-layer')).toHaveCount(0);

  // The Toolkit opens on Colours with it; the page's colours, most used first.
  const panel = await pageWith(app, '#/notes/panel/tools/colors');
  await expect(
    panel.getByTestId('toolkit-recent').getByTestId('toolkit-swatch-button'),
  ).toHaveAttribute('data-hex', '#5b5bd6');
  await expect(panel.getByTestId('toolkit-format').first()).toHaveText('#5b5bd6');
  await panel.getByTestId('toolkit-scan-palette').click();
  const palette = panel.getByTestId('toolkit-palette');
  await expect(palette.locator('[data-hex="#5b5bd6"]')).toHaveCount(1);
  await expect(palette.locator('[data-hex="#222222"]')).toHaveCount(1);

  // Palette: complementary colours of the picked one; a click makes one the colour you're on.
  await panel.locator('[data-testid="palette-mode"][data-value="complementary"]').click();
  const strip = panel.getByTestId('palette-colors').getByTestId('strip-color');
  await expect(strip).toHaveCount(5);
  await expect(panel.getByTestId('gradient-css')).toContainText('linear-gradient(135deg');
  const fourth = await strip.nth(3).getAttribute('data-hex');
  await strip.nth(3).click();
  await expect(panel.getByTestId('toolkit-color-input')).toHaveValue(fourth!);
  // From an image: half red, half blue → those two colours.
  const png = await app.evaluate(({ nativeImage }) => {
    const [w, h] = [20, 20];
    const bgra = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        bgra.set(x < 10 ? [0, 0, 255, 255] : [255, 0, 0, 255], o); // red | blue (BGRA)
      }
    return nativeImage.createFromBitmap(bgra, { width: w, height: h }).toPNG().toString('base64');
  });
  await panel.getByTestId('image-palette-file').setInputFiles({
    name: 'flag.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  const fromImage = panel.getByTestId('image-palette-colors').getByTestId('strip-color');
  await expect(fromImage.first()).toBeVisible();
  const hexes = await fromImage.evaluateAll((els) =>
    els.map((e) => (e as unknown as { dataset: { hex: string } }).dataset.hex),
  );
  expect(hexes).toEqual(expect.arrayContaining(['#ff0000', '#0000ff']));

  // Contrast: light grey on white fails AA; the nearest passing grey fixes it.
  await panel.locator('[data-testid="toolkit-section"][data-section="contrast"]').click();
  await panel.getByTestId('contrast-fg').fill('#aaaaaa');
  await expect(panel.getByTestId('contrast-aa')).toHaveAttribute('data-pass', 'false');
  await expect(panel.getByTestId('contrast-aa-large')).toHaveAttribute('data-pass', 'false');
  await panel.getByTestId('contrast-fix').click();
  await expect(panel.getByTestId('contrast-aa')).toHaveAttribute('data-pass', 'true');

  // JSON: where it's broken; sorted when it isn't.
  await panel.locator('[data-testid="toolkit-section"][data-section="code"]').click();
  await panel.getByTestId('json-input').fill('{"a": 1,\n "b": }');
  await panel.getByTestId('json-format').click();
  await expect(panel.getByTestId('json-error')).toContainText('Line 2, column 7');
  await panel.getByTestId('json-input').fill('{"b":1,"a":2}');
  await panel.getByTestId('json-sort').click();
  await expect(panel.getByTestId('json-output')).toHaveText('{\n  "a": 2,\n  "b": 1\n}');

  // Image Info from the image's right-click menu.
  expect(
    await rightClickAndPick(
      app,
      '/colors',
      { mediaType: 'image', srcURL: server.url('/icon.png'), altText: 'A dot' },
      'Image Info…',
    ),
  ).toBe(true);
  const image = panel.getByTestId('toolkit-image');
  await expect(image).toContainText('PNG · image/png');
  await expect(image).toContainText('1 × 1 px');
  await expect(image).toContainText('A dot');
  await expect(image).toContainText('RGBA, 8-bit');
});

test('Developer tools: JSON pages as a tree, responsive mode, local servers', async () => {
  const { app, win } = orbit;

  // An address that answers with JSON shows as a tree, with Raw.
  await invoke(win, 'tabs:create', { url: server.url('/data.json') });
  const json = await pageWith(app, '/data.json');
  await expect(json.locator('#orbit-json')).toBeVisible();
  await expect(json.locator('#orbit-json .oj-meta')).toContainText('Object · 3 keys');
  await expect(json.locator('#orbit-json .oj-key').first()).toHaveText('"name"');
  await json.locator('#orbit-json button', { hasText: 'Raw' }).click();
  await expect(json.locator('#orbit-json .oj-raw')).toBeVisible();

  // Responsive mode (⌥⌘R): the page at a phone's width; rotate; Done.
  await invoke(win, 'tabs:create', { url: server.url('/mobile') });
  const page = await pageWith(app, '/mobile');
  const before = Number(await page.evaluate('window.innerWidth'));
  await clickMenu(app, 'responsive');
  await expect(win.getByTestId('responsive-frame')).toBeVisible();
  await expect(win.getByTestId('responsive-device')).toHaveValue('iPhone 15');
  await expect.poll(() => page.evaluate('window.innerWidth')).toBe(393);
  await win.getByTestId('responsive-rotate').click();
  await expect.poll(() => page.evaluate('window.innerWidth')).toBe(852);
  await win.getByTestId('responsive-done').click();
  await expect(win.getByTestId('responsive-frame')).toHaveCount(0);
  await expect.poll(() => page.evaluate('window.innerWidth')).toBe(before);

  // Local servers: "localhost" in ⌘T finds them by their page titles…
  await invoke(win, 'commandbar:open', { mode: 'new' });
  const bar = await pageWith(app, '/overlay/');
  await bar.keyboard.type('localhost');
  await expect(
    bar.locator('[data-testid="command-item"]').filter({ hasText: 'Test Dev Server' }),
  ).toHaveCount(1);
  await bar.keyboard.press('Escape');

  // …and the Toolkit's Dev section lists them.
  await clickMenu(app, 'toolkit');
  const panel = await pageWith(app, '#/notes/panel/tools');
  await panel.locator('[data-testid="toolkit-section"][data-section="dev"]').click();
  await panel.getByTestId('toolkit-scan-servers').click();
  await expect(panel.getByTestId('toolkit-server')).toContainText('Test Dev Server');
});

test('Type and Code: fonts on the page, a type scale, encode/decode, regex (roadmap P4.6)', async () => {
  const { app, win } = orbit;
  await invoke(win, 'tabs:create', { url: server.url('/colors') });
  await pageWith(app, '/colors');
  await clickMenu(app, 'toolkit');
  const panel = await pageWith(app, '#/notes/panel/tools');

  await panel.locator('[data-testid="toolkit-section"][data-section="type"]').click();
  await panel.getByTestId('toolkit-scan-fonts').click();
  await expect(panel.getByTestId('toolkit-font').first()).toContainText('element');
  await panel.getByTestId('scale-base').fill('20');
  await expect(panel.getByTestId('scale-steps')).toContainText('20px');

  await panel.locator('[data-testid="toolkit-section"][data-section="code"]').click();
  await panel.getByTestId('codec-input').fill('héllo');
  await expect(panel.getByTestId('codec-output')).toHaveText('aMOpbGxv');
  await panel.getByTestId('codec-mode').selectOption('decode');
  await panel.getByTestId('codec-input').fill('aMOpbGxv');
  await expect(panel.getByTestId('codec-output')).toHaveText('héllo');
  await panel.getByTestId('regex-pattern').fill('(\\d+)px');
  await panel.getByTestId('regex-text').fill('12px and 40px');
  await expect(panel.getByTestId('regex-match')).toHaveCount(2);
  await panel.getByTestId('uuid-make').click();
  await expect(panel.getByTestId('uuid-list').locator('li')).toHaveCount(5);
});
