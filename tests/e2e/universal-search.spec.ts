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
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}

test('⌘T finds tabs in other Spaces, saved research and archived tabs', async () => {
  const server = await startTestServer();
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const spaceName = win.getByTestId('space-name');
    const first = (await spaceName.textContent()) ?? '';

    // A tab in a second Space; then back to the first.
    await clickMenu(app, 'new-space');
    await win.getByTestId('rename-input').press('Escape'); // keep its name
    await expect(spaceName).not.toHaveText(first);
    const second = (await spaceName.textContent()) ?? '';
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
    const spaces = await invoke<{ spaces: { id: string }[] }>(win, 'sidebar:get');
    await invoke(win, 'spaces:activate', { spaceId: spaces.spaces[0]!.id });
    await expect(spaceName).toHaveText(first);

    // A finding, saved Unsorted.
    await invoke(win, 'tabs:create', { url: server.url('/research') });
    const site = await pageWith(app, '/research');
    await site.evaluate(`(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('quote'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(r);
    })()`);
    await clickMenu(app, 'capture');
    const bar = await pageWith(app, '/overlay/');
    await bar.getByTestId('capture-project').selectOption({ label: 'Unsorted' });
    await bar.getByTestId('capture-comment').fill('Baseline research');
    await bar.getByTestId('capture-save').click();
    await expect(bar.getByTestId('capture-card')).toHaveCount(0);

    // A tab closed (archived).
    const words = (
      await invoke<{ tabId: string }>(win, 'tabs:create', {
        url: server.url('/words'),
      })
    ).tabId;
    await expect(win.getByTestId('toolbar-address')).toContainText('Words');
    await invoke(win, 'tabs:close', { tabId: words });
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await expect(today.filter({ hasText: 'Words' })).toHaveCount(0);

    const search = async (query: string) => {
      await invoke(win, 'commandbar:open', { mode: 'new' });
      await bar.getByTestId('command-input').fill(query);
    };

    // The other Space's tab: picking it goes there.
    await search('Page Two');
    const tab = bar.locator('[data-testid="command-item"][data-kind="tab"]').first();
    await expect(tab).toContainText(`Switch to tab · ${second}`);
    await tab.click();
    await expect(spaceName).toHaveText(second);
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');

    // The finding: it opens in the panel's Research.
    await search('Baseline research');
    const finding = bar.locator('[data-testid="command-item"][data-kind="capture"]');
    await expect(finding).toContainText('Research · Unsorted');
    await finding.click();
    const panel = await pageWith(app, '#/notes/panel');
    await expect(panel.getByTestId('research-view')).toBeVisible();
    await expect(panel.getByTestId('research-label')).toHaveText(['Baseline research']);

    // The archived tab comes back.
    await invoke(win, 'spaces:activate', { spaceId: spaces.spaces[0]!.id });
    await search('Words');
    const archived = bar.locator('[data-testid="command-item"][data-kind="archived"]');
    await expect(archived).toContainText('Archived tab');
    await archived.click();
    await expect(today.filter({ hasText: 'Words' })).toHaveCount(1);
  } finally {
    await orbit.close();
    await server.close();
  }
});
