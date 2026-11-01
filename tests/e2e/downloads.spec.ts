import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
const openTab = (win: Page, url: string) =>
  win.evaluate(
    (u) =>
      (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke('tabs:create', {
        url: u,
      }),
    url,
  );

test('downloads save without a dialog, show on the shelf, never overwrite, and can be dismissed', async () => {
  const { win, userData } = orbit;
  const dir = join(userData, 'Downloads');

  await openTab(win, server.url('/report.txt'));
  const items = win.getByTestId('download-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-state', 'completed');
  await expect(items.first()).toContainText('report.txt');
  await expect(items.first()).toContainText('just now');
  expect(readFileSync(join(dir, 'report.txt'), 'utf8')).toBe('Orbit download test\n');

  // A second download of the same file gets " (1)".
  await openTab(win, server.url('/report.txt'));
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('report (1).txt');
  expect(existsSync(join(dir, 'report (1).txt'))).toBe(true);

  await items.first().hover();
  await items.first().getByTestId('download-dismiss').click();
  await expect(items).toHaveCount(1);
});
