import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import { startTestServer } from './test-server';

/**
 * The UI redesign spec's own checks (orbit_ui_redesign_implementation_spec.md §15–17): one tab
 * model in both layouts, one pinned-app list in the rail and the grid, the wallpaper driving the
 * theme (and your overrides respected), and the Orbit menu doing real things.
 */

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
async function openSettings(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="appearance"]').click();
  return settings;
}
type Canvas = {
  wallpaper: { kind: string; id?: string };
  accent: string;
  auto: boolean;
  vars: Record<string, string>;
};
const canvas = (win: Page) => invoke<Canvas>(win, 'canvas:get');
const tabsOf = (win: Page) =>
  invoke<{ tabs: { id: string; url: string }[]; activeTabId: string | null }>(win, 'tabs:get');

test('Sidebar and Horizontal tabs share one tab model: switching keeps every tab, and sticks', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await invoke(win, 'tabs:create', { url: server.url('/two') });
    const before = await tabsOf(win);

    const settings = await openSettings(app);
    await settings.locator('[data-testid="ui-tab-layout"] [data-value="top"]').click();
    await expect(win.getByTestId('tab-strip')).toBeVisible();
    await expect(win.getByTestId('strip-tab')).toHaveCount(3);
    await expect(win.getByTestId('app-rail')).toBeVisible(); // the rail holds the apps
    const after = await tabsOf(win);
    expect(after.tabs.map((t) => t.id)).toEqual(before.tabs.map((t) => t.id));
    expect(after.activeTabId).toBe(before.activeTabId);
    // The address row sits over the page, clear of the tab row.
    const row = (await win.getByTestId('toolbar').boundingBox())!;
    const strip = (await win.getByTestId('tab-strip').boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(strip.y + strip.height);
    await closeSettings(app);
  } finally {
    await first.close({ keepData: true });
  }
  const second = await launchOrbit({ userData });
  try {
    await expect(second.win.getByTestId('tab-strip')).toBeVisible();
    const settings = await openSettings(second.app);
    await settings.locator('[data-testid="ui-tab-layout"] [data-value="sidebar"]').click();
    await expect(second.win.getByTestId('tab-strip')).toHaveCount(0);
    await expect(second.win.getByTestId('sidebar')).toBeVisible();
  } finally {
    await second.close();
    await server.close();
  }
});

test('the rail and the sidebar grid show the same pinned apps; the choice is kept', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    const settings = await openSettings(app);
    await invoke(settings, 'apps:add', { url: server.url('/one'), title: 'Desk' });
    await invoke(settings, 'apps:add', { url: server.url('/two'), title: 'Mail' });
    // In the rail (UI 1).
    const rail = win.getByTestId('app-rail');
    await expect(rail.getByTestId('favorite-tile')).toHaveCount(2);
    // New apps open beside the page unless you choose otherwise.
    await expect(rail.getByTestId('favorite-opens-in').first()).toHaveAttribute(
      'data-open-in',
      'panel',
    );
    // As a grid inside the sidebar (UI 2): the same two, no rail.
    await settings.locator('[data-testid="ui-apps"] [data-value="grid"]').click();
    await expect(rail).toHaveCount(0);
    await expect(win.getByTestId('sidebar')).toHaveAttribute('data-grid', 'true');
    await expect(win.getByTestId('favorites').getByTestId('favorite-tile')).toHaveCount(2);
    await expect(win.getByTestId('favorites')).toContainText('Mail');
    // The Orbit menu moved into the sidebar with the traffic lights.
    await expect(win.getByTestId('sidebar').getByTestId('orbit-menu-button')).toBeVisible();
    await closeSettings(app);
  } finally {
    await first.close({ keepData: true });
  }
  const second = await launchOrbit({ userData });
  try {
    await expect(second.win.getByTestId('sidebar')).toHaveAttribute('data-grid', 'true');
    await expect(second.win.getByTestId('app-rail')).toHaveCount(0);
  } finally {
    await second.close();
    await server.close();
  }
});

test('the wallpaper sets the theme; your accent, glass level and Match the wallpaper are respected', async () => {
  test.setTimeout(90_000);
  const { app, win, close } = await launchOrbit();
  try {
    // The shell paints the wallpaper behind everything.
    await expect(win.getByTestId('canvas')).toHaveAttribute('data-wallpaper', 'misty-sunrise');
    const first = await canvas(win);
    expect(first.auto).toBe(true);

    // A different wallpaper: the canvas and its colours follow.
    const settings = await openSettings(app);
    await settings.locator('[data-testid="ui-wallpaper"][data-value="pearl"]').click();
    await expect(win.getByTestId('canvas')).toHaveAttribute('data-wallpaper', 'pearl');
    await expect.poll(async () => (await canvas(win)).accent).not.toBe(first.accent);
    await expect(win.getByTestId('shell')).toHaveAttribute('data-tone', 'light');

    // Your accent wins over the wallpaper's; Auto gives it back.
    await settings.locator('[data-testid="ui-accent"] [data-value="#e8590c"]').click();
    await expect.poll(async () => (await canvas(win)).accent).toBe('#e8590c');
    await settings.locator('[data-testid="ui-accent"] [data-value="space"]').click();
    await expect.poll(async () => (await canvas(win)).accent).not.toBe('#e8590c');

    // Glass level: Subtle is more solid than Strong.
    const alpha = (v: string) => Number(/\/ ([\d.]+)\)/.exec(v)![1]);
    await settings.locator('[data-testid="ui-glass"] [data-value="subtle"]').click();
    await expect
      .poll(async () => alpha((await canvas(win)).vars['--glass-deep']!))
      .toBeGreaterThan(0.6);
    const subtle = alpha((await canvas(win)).vars['--glass-deep']!);
    await settings.locator('[data-testid="ui-glass"] [data-value="strong"]').click();
    await expect
      .poll(async () => alpha((await canvas(win)).vars['--glass-deep']!))
      .toBeLessThan(subtle);

    // Match the wallpaper off: the accent is no longer the wallpaper's.
    await settings.getByTestId('ui-palette').click();
    await expect.poll(async () => (await canvas(win)).auto).toBe(false);
  } finally {
    await close();
  }
});

test('the Orbit menu: real actions only — Spaces, Settings — and sync shows nothing when off', async () => {
  test.setTimeout(90_000);
  const { app, win, close } = await launchOrbit();
  try {
    await clickMenu(app, 'new-space');
    const overlay = await pageWith(app, '/overlay/');
    await win.getByTestId('orbit-menu-button').click();
    const menu = overlay.getByTestId('orbit-menu');
    await expect(menu).toBeVisible();
    await expect(overlay.getByTestId('orbit-menu-sync')).toHaveCount(0); // no account here
    await overlay.getByTestId('orbit-menu-spaces').click();
    await expect(overlay.getByTestId('orbit-menu-space')).toHaveCount(2);
    // The first Space: Orbit goes there and the menu closes.
    await overlay.getByTestId('orbit-menu-space').first().click();
    await expect(menu).toHaveCount(0);
    await expect(win.getByTestId('space-name')).toHaveText('Personal');

    await win.getByTestId('orbit-menu-button').click();
    await overlay.getByTestId('orbit-menu-item').filter({ hasText: 'Settings' }).click();
    await pageWith(app, '#/settings');
    await closeSettings(app);
  } finally {
    await close();
  }
});

/** Native menus: records each one's labels and can pick an item (instead of showing them). */
const captureMenus = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => {
    type Item = { label?: string; click?: () => void };
    const g = globalThis as unknown as { menus: Item[][] };
    g.menus = [];
    Menu.buildFromTemplate = ((template: Item[]) => {
      g.menus.push(template);
      return { popup: () => undefined };
    }) as never;
  });
const lastMenuLabels = (app: ElectronApplication) =>
  app.evaluate(() => {
    const g = globalThis as unknown as { menus: { label?: string }[][] };
    return (g.menus.at(-1) ?? []).map((i) => i.label ?? '—');
  });
const pick = (app: ElectronApplication, label: string) =>
  app.evaluate((_e, l) => {
    const g = globalThis as unknown as { menus: { label?: string; click?: () => void }[][] };
    g.menus
      .at(-1)
      ?.find((i) => i.label === l)
      ?.click?.();
  }, label);

test('right-click the toolbar or a tab: switch between sidebar and horizontal tabs', async () => {
  test.setTimeout(60_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  try {
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
    await captureMenus(app);

    // The toolbar row's empty space (not the address or a button).
    const bar = (await win.getByTestId('toolbar').boundingBox())!;
    const nav = (await win.getByTestId('nav-pill').boundingBox())!;
    await win.mouse.click(nav.x - 12, bar.y + bar.height / 2, { button: 'right' });
    await expect.poll(() => lastMenuLabels(app)).toContain('Switch to Horizontal Tabs');
    await pick(app, 'Switch to Horizontal Tabs');
    await expect(win.getByTestId('tab-strip')).toBeVisible();

    // A tab pill's own menu has the way back (and the strip's empty space too).
    await win.getByTestId('strip-tab').first().click({ button: 'right' });
    await expect.poll(() => lastMenuLabels(app)).toContain('Switch to Sidebar Tabs');
    expect(await lastMenuLabels(app)).toContain('Duplicate'); // still the tab's menu
    await pick(app, 'Switch to Sidebar Tabs');
    await expect(win.getByTestId('tab-strip')).toHaveCount(0);
    await expect(win.getByTestId('sidebar')).toBeVisible();

    // A sidebar tab row's menu offers it too.
    await win.locator('[data-testid="tab-list"] [data-testid="tab-row"]').first().click({
      button: 'right',
    });
    await expect.poll(() => lastMenuLabels(app)).toContain('Switch to Horizontal Tabs');
  } finally {
    await close();
    await server.close();
  }
});

test('a click outside the Orbit menu (or Esc) closes it, and Orbit takes clicks again', async () => {
  const { app, win, close } = await launchOrbit();
  try {
    const overlay = await pageWith(app, '/overlay/');
    await win.getByTestId('orbit-menu-button').click();
    await expect(overlay.getByTestId('orbit-menu')).toBeVisible();
    // Anywhere else on the window: the menu goes, and the overlay with it.
    await overlay.getByTestId('orbit-menu-backdrop').click({ position: { x: 900, y: 500 } });
    await expect(overlay.getByTestId('orbit-menu')).toHaveCount(0);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.contentView.children.at(-1)!.getVisible(),
        ),
      )
      .toBe(false);
    // Esc too.
    await win.getByTestId('orbit-menu-button').click();
    await expect(overlay.getByTestId('orbit-menu')).toBeVisible();
    await overlay.keyboard.press('Escape');
    await expect(overlay.getByTestId('orbit-menu')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('Shift+← and Shift+→ go back and forward; in a text box they select text as usual', async () => {
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  const press = (fragment: string, key: 'Left' | 'Right') =>
    app.evaluate(
      ({ webContents }, [f, k]) => {
        const c = webContents.getAllWebContents().find((w) => w.getURL().includes(f!))!;
        c.focus();
        c.sendInputEvent({ type: 'keyDown', keyCode: k!, modifiers: ['shift'] });
        c.sendInputEvent({ type: 'keyUp', keyCode: k!, modifiers: ['shift'] });
      },
      [fragment, key] as const,
    );
  try {
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
    const one = app.windows().find((p) => p.url().includes('/one'))!;
    await one.click('#next');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Three');

    await press('/three', 'Left');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
    await press('/one', 'Right');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Three');
    // From Orbit's own toolbar (focus in the shell): the page on screen goes back.
    await press('/shell/', 'Left');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    // In the Homepage's search box: the keys stay with the text.
    await invoke(win, 'tabs:create', {});
    const home = await pageWith(app, '#/newtab');
    await home.getByTestId('newtab-search').fill('hello');
    await press('#/newtab', 'Left');
    await expect
      .poll(() =>
        home.getByTestId('newtab-search').evaluate((el) => {
          const input = el as unknown as { selectionStart: number; selectionEnd: number };
          return input.selectionEnd - input.selectionStart;
        }),
      )
      .toBe(1);
    await expect(home.getByTestId('newtab')).toBeVisible(); // still the Homepage
  } finally {
    await close();
    await server.close();
  }
});
