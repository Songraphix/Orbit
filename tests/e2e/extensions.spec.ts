import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/**
 * Seeds a profile with a tiny MV3 extension laid out like a Web Store install (a `key` in the
 * manifest), so no download is needed: a content script that marks pages, a popup, and a
 * service worker that sets a badge.
 */
function seedExtension(userData: string): string {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const id = [...createHash('sha256').update(der).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
    .join('');
  const dir = join(userData, 'Extensions', id, '1.0_0');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Orbit Test Extension',
      version: '1.0',
      key: der.toString('base64'),
      action: { default_title: 'Test Extension', default_popup: 'popup.html' },
      background: { service_worker: 'bg.js' },
      content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['content.js'] }],
    }),
  );
  writeFileSync(join(dir, 'content.js'), 'document.documentElement.dataset.orbitExt = "on";');
  writeFileSync(join(dir, 'bg.js'), 'chrome.action.setBadgeText({ text: "7" });');
  writeFileSync(join(dir, 'popup.html'), '<!doctype html><title>Popup</title><p>Hello</p>');
  return id;
}

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );

async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

test('installed extensions run on pages and show in site controls with their popup', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'orbit-e2e-'));
  const id = seedExtension(userData);
  const orbit = await launchOrbit({ userData });
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // The content script ran in the page.
    await expect
      .poll(() =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .find((w) => w.getURL().includes('/one'))!
            .executeJavaScript('document.documentElement.dataset.orbitExt ?? ""'),
        ),
      )
      .toBe('on');

    await win.getByTestId('toolbar-site-controls').click();
    const bar = await overlay(app);
    const button = bar.locator(`[data-testid="site-extension"][data-extension-id="${id}"]`);
    await expect(button).toHaveAttribute('aria-label', 'Test Extension');
    // The service worker's chrome.action.setBadgeText reached the button.
    await expect
      .poll(async () => {
        await bar.keyboard.press('Escape');
        await win.getByTestId('toolbar-site-controls').click();
        return button.textContent();
      })
      .toBe('7');

    // Clicking it opens the extension's popup window.
    await button.click();
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }, extId) =>
            webContents
              .getAllWebContents()
              .some((w) => w.getURL() === `chrome-extension://${extId}/popup.html`),
          id,
        ),
      )
      .toBe(true);
  } finally {
    await orbit.close();
  }
});
