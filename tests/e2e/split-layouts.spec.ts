import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = <T = unknown>(win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  ) as Promise<T>;
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
const panes = (win: Page) =>
  invoke<{ panes: unknown[] }>(win, 'layout:get').then((l) => l.panes.length);
const row = (win: Page, title: string) =>
  win.locator('[data-testid="tab-list"] [data-testid="tab-row"]', { hasText: title });

test('a Space keeps its split: other tabs park it, either half brings it back, even after a restart', async () => {
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'tabs:create', { url: server.url('/words') });
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // ⌥⏎ in ⌘T opens Page Two beside Page One.
    await invoke(win, 'commandbar:open', { mode: 'new' });
    const bar = await pageWith(app, '/overlay/');
    await bar.getByTestId('command-input').fill('Page Two');
    await expect(bar.locator('[data-testid="command-item"][data-kind="tab"]')).toHaveCount(1);
    await bar.getByTestId('command-input').press('ArrowDown'); // past "Search…" to the tab
    const selected = bar.locator('[data-testid="command-item"][data-kind="tab"]');
    await selected.hover();
    await bar.getByTestId('command-input').press('Alt+Enter');
    await expect.poll(() => panes(win)).toBe(2);

    // Another tab parks it; both halves say they're a pair.
    await row(win, 'Words').click();
    await expect.poll(() => panes(win)).toBe(1);
    await expect(row(win, 'Page One').getByTestId('row-split')).toBeVisible();
    await expect(row(win, 'Page Two').getByTestId('row-split')).toBeVisible();
    await expect(row(win, 'Words').getByTestId('row-split')).toHaveCount(0);

    // Either half brings the pair back.
    await row(win, 'Page Two').click();
    await expect.poll(() => panes(win)).toBe(2);
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData });
  try {
    const { win } = second;
    // Back where we were: the split, as it was.
    await expect.poll(() => panes(win)).toBe(2);
    // Exit Split View forgets it.
    await invoke(win, 'split:exit', {});
    await expect.poll(() => panes(win)).toBe(1);
    await expect(row(win, 'Page One').getByTestId('row-split')).toHaveCount(0);
    await row(win, 'Words').click();
    await row(win, 'Page One').click();
    await expect.poll(() => panes(win)).toBe(1);
  } finally {
    await second.close();
    await server.close();
  }
});
