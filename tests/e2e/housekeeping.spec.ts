import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );

async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
/** Runs a command from ⌘T, as a user would: type its name, pick it. */
async function command(app: ElectronApplication, win: Page, title: string) {
  await invoke(win, 'commandbar:open', { mode: 'new' });
  const bar = await pageWith(app, '/overlay/');
  await bar.keyboard.type(title);
  await bar
    .locator('[data-testid="command-item"][data-kind="command"]', { hasText: title })
    .click();
}

test('Today housekeeping: close duplicate tabs, sort by title (roadmap P4.5)', async () => {
  const server = await startTestServer();
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    for (const path of ['/two', '/one', '/two#again', '/three', '/one'])
      await invoke(win, 'tabs:create', { url: server.url(path) });
    const rows = win.getByTestId('tab-list').getByTestId('tab-row');
    await expect(rows).toHaveCount(6); // + the new tab page

    // ⌘T → Close Duplicate Tabs: one copy of each page stays (the most recently used).
    await command(app, win, 'Close Duplicate Tabs');
    await expect(win.getByTestId('toolbar-toast')).toContainText('Closed 2 duplicates');
    await expect(rows).toHaveCount(4);

    // Sort Today by Title.
    await command(app, win, 'Sort Today by Title');
    await expect(rows).toHaveText([/New Tab/, /Page One/, /Page Three/, /Page Two/]);
  } finally {
    await orbit.close();
    await server.close();
  }
});
