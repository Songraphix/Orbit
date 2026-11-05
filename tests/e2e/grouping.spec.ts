import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import { startTestServer } from './test-server';

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

const TITLES = [
  'Kyoto temples to visit',
  'Kyoto hotels near Gion',
  'Kyoto street food',
  'Budget planning 2027',
  'Budget review notes',
  'Garden ideas for spring',
  'Garden tools on sale',
  'Lentil soup recipe',
];

test('Group Tabs: suggested for a crowded Today, previewed, edited, applied — and undone', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  try {
    for (const t of TITLES) {
      await invoke(win, 'tabs:create', { url: server.url(`/titled?t=${encodeURIComponent(t)}`) });
    }
    const rows = win.getByTestId('tab-row');
    for (const t of TITLES) await expect(rows.filter({ hasText: t })).toHaveCount(1);
    // A crowded Today: the header suggests grouping (nothing has moved).
    const suggest = win.getByTestId('suggest-groups');
    await expect(suggest).toBeVisible();
    await suggest.click();

    const overlay = await pageWith(app, '/overlay/');
    const card = overlay.getByTestId('grouping-card');
    await expect(card).toBeVisible();
    const groups = card.getByTestId('grouping-group');
    await expect(groups).toHaveCount(3);
    const names = () =>
      card
        .getByTestId('grouping-name')
        .evaluateAll((inputs) => inputs.map((i) => (i as unknown as { value: string }).value));
    await expect.poll(names).toEqual(['Kyoto', 'Budget', 'Garden']);
    await expect(card.getByTestId('grouping-summary')).toContainText('3 folders, 7 of 9 tabs');

    // Edit: rename Kyoto, take one tab out of it, merge Garden into Budget.
    await card.getByTestId('grouping-name').first().fill('Japan Trip');
    await groups.first().getByTestId('grouping-expand').click();
    await groups.first().getByLabel('Keep Kyoto street food in this folder').uncheck();
    await groups.nth(2).getByTestId('grouping-merge').selectOption({ label: 'Into Budget' });
    await card.getByTestId('grouping-name').nth(1).fill('Home');
    await expect(card.getByTestId('grouping-summary')).toContainText('2 folders, 6 of 9 tabs');
    await card.getByTestId('grouping-apply').click();
    await expect(card).toHaveCount(0);

    // Folders at the top of Today, with exactly those tabs.
    const folders = win.getByTestId('folder-row');
    await expect(folders).toHaveCount(2);
    await expect(folders.first()).toContainText('Japan Trip');
    await expect(folders.nth(1)).toContainText('Home');
    const snapshot = await invoke<{ today: { title: string; depth: number }[] }>(
      win,
      'sidebar:get',
    );
    const nested = snapshot.today.filter((r) => r.depth === 1).map((r) => r.title);
    expect(nested).toEqual(
      expect.arrayContaining([
        'Kyoto temples to visit',
        'Kyoto hotels near Gion',
        'Budget planning 2027',
        'Garden tools on sale',
      ]),
    );
    expect(nested).not.toContain('Kyoto street food');
    expect(nested).toHaveLength(6);

    // Undo puts every tab back where it was; no tab was lost.
    await win.getByTestId('untidy').click();
    await expect(folders).toHaveCount(0);
    for (const t of TITLES) await expect(rows.filter({ hasText: t })).toHaveCount(1);

    // Not Now: the suggestion steps back; the setting turns it off altogether.
    await suggest.click();
    await overlay.getByTestId('grouping-cancel').click();
    await expect(suggest).toHaveCount(0);
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await expect(settings.getByTestId('setting-group-suggestions')).toBeChecked();
    await settings.getByTestId('setting-group-suggestions').click();
    await expect(settings.getByTestId('setting-group-suggestions')).not.toBeChecked();
    await closeSettings(app);
    // Still available on request (command bar, sidebar menu).
    await clickMenu(app, 'new-tab');
    const bar = await pageWith(app, '/overlay/');
    await bar.getByTestId('command-input').fill('group tabs');
    await bar.getByTestId('command-item').filter({ hasText: 'Group Tabs…' }).click();
    await expect(overlay.getByTestId('grouping-card')).toBeVisible();
  } finally {
    await close();
    await server.close();
  }
});
