import { expect, test } from '@playwright/test';
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

test('a link from another app opens in Little Orbit; “Open in Orbit” moves it to the main window', async () => {
  const { app, win } = orbit;
  // macOS delivers links from other apps as an 'open-url' event.
  await app.evaluate(({ app: electronApp }, url) => {
    electronApp.emit('open-url', { preventDefault: () => undefined }, url);
  }, server.url('/one'));

  await expect.poll(() => app.windows().some((p) => p.url().includes('mode=little'))).toBe(true);
  const bar = app.windows().find((p) => p.url().includes('mode=little'))!;
  await expect(bar.getByTestId('little-address')).toContainText('Page One');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);

  await bar.getByTestId('little-promote').click();
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(1);
  await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
});

test('non-web links from other apps are ignored', async () => {
  const { app } = orbit;
  await app.evaluate(({ app: electronApp }) => {
    electronApp.emit('open-url', { preventDefault: () => undefined }, 'file:///etc/passwd');
  });
  await new Promise((r) => setTimeout(r, 500));
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('⌥⌘N opens an empty Little Orbit that asks where to go', async () => {
  const { app } = orbit;
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!.getMenuItemById('new-little')!.click(),
  );

  await expect.poll(() => app.windows().some((p) => p.url().includes('mode=little'))).toBe(true);
  const bar = app.windows().find((p) => p.url().includes('mode=little'))!;
  const input = bar.getByTestId('little-input');
  await expect(input).toBeFocused();
  await expect(bar.getByTestId('little-promote')).toBeDisabled();

  await input.fill(server.url('/two'));
  await input.press('Enter');
  await expect(bar.getByTestId('little-address')).toContainText('Page Two');
  await expect(bar.getByTestId('little-promote')).toBeEnabled();
});
