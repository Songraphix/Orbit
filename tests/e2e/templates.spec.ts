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
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
/** The next native menu built picks the item at `path` (submenus included). */
const pickNextMenu = (app: ElectronApplication, path: string[]) =>
  app.evaluate(({ Menu }, labels) => {
    type Item = { label?: string; click?: () => void; submenu?: Item[] };
    const original = Menu.buildFromTemplate;
    Menu.buildFromTemplate = ((template: Item[]) => {
      Menu.buildFromTemplate = original;
      let items: Item[] | undefined = template;
      let found: Item | undefined;
      for (const label of labels) {
        found = items?.find((i) => i.label === label);
        items = found?.submenu;
      }
      found?.click?.();
      return { popup: () => undefined };
    }) as never;
  }, path);

test('a Space saved as a template starts new Spaces and project workspaces', async () => {
  const server = await startTestServer();
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    // A Space with a pinned tool and a page.
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await clickMenu(app, 'toggle-pin');
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
    const spaces = await invoke<{ spaces: { id: string; name: string }[] }>(win, 'sidebar:get');
    const personal = spaces.spaces[0]!;

    await pickNextMenu(app, ['Save as Workspace Template']);
    await invoke(win, 'sidebar:spaceMenu', { spaceId: personal.id });
    await expect(win.getByTestId('toolbar-toast')).toContainText(
      `Saved “${personal.name}” as a template (2 tabs)`,
    );

    // Settings → Workspaces lists it; rename it.
    await invoke(win, 'tabs:create', { url: 'orbit://settings/workspaces' });
    const settings = await pageWith(app, '#/settings');
    await expect(settings.getByTestId('template-row')).toHaveCount(1);
    await settings.getByTestId('template-name').fill('Design kit');
    await settings.getByTestId('template-name').press('Enter');
    await expect
      .poll(async () => {
        const r = await settings.evaluate(() =>
          (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(
            'templates:list',
            {},
          ),
        );
        return (r as { templates: { name: string }[] }).templates[0]?.name;
      })
      .toBe('Design kit');

    // A new Space from it: the pinned tool and the page, in order.
    await pickNextMenu(app, ['New Space from Template', 'Design kit']);
    await invoke(win, 'sidebar:spaceMenu', { spaceId: personal.id });
    await expect(win.getByTestId('space-name')).toHaveText('Design kit');
    await expect(win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]')).toHaveText([
      'Page One',
    ]);
    await expect(win.locator('[data-testid="tab-list"] [data-testid="tab-row"]')).toHaveText([
      'Page Two',
    ]);

    // A new project's workspace from it.
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('project-name').fill('Client C');
    await panel
      .getByTestId('project-space')
      .selectOption({ label: '+ New Space from template: Design kit' });
    await panel.getByTestId('form-save').click();
    await panel.getByTestId('project-card').filter({ hasText: 'Client C' }).click();
    await expect(panel.getByTestId('project-workspace')).toContainText('Client C');
    await panel.getByTestId('open-workspace').click();
    await expect(win.getByTestId('space-name')).toHaveText('Client C');
    await expect(win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]')).toHaveText([
      'Page One',
    ]);
  } finally {
    await orbit.close();
    await server.close();
  }
});
