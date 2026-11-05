import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
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
async function openSettings(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'settings');
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/settings'))).toBe(true);
  return app.windows().find((p) => p.url().includes('#/settings'))!;
}
type AppList = { apps: { id: string; title: string }[] };
/** Adds favourites that open in the docked panel (through Settings → Apps' own calls). */
async function addPanelApps(
  app: ElectronApplication,
  apps: { url: string; title: string }[],
  /** Where apps open: these tests mostly use the dock on the right (shared with Notes). */
  side: 'left' | 'right' = 'right',
) {
  const settings = await openSettings(app);
  await invoke(settings, 'ui:set', { appSide: side });
  let list: AppList = { apps: [] };
  for (const a of apps) list = await invoke<AppList>(settings, 'apps:add', a);
  for (const a of list.apps)
    await invoke(settings, 'apps:update', { itemId: a.id, openIn: 'panel' });
  await closeSettings(app);
  return list.apps;
}
/** A port that was free a moment ago (nothing listens on it). */
const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
/** The dock has finished sliding in: its right edge sits 10 px inside the window. */
const dockSettled = (win: Page) =>
  expect
    .poll(async () => {
      const layout = await invoke<{ notes: { x: number; width: number } | null }>(
        win,
        'layout:get',
      );
      const width = (await win.evaluate('innerWidth')) as number;
      return layout.notes ? Math.round(layout.notes.x + layout.notes.width + 10 - width) : null;
    })
    .toBe(0);
const dockWidth = (win: Page) =>
  invoke<{ notes: { width: number } | null }>(win, 'layout:get').then((l) => l.notes?.width ?? 0);

test('the docked panel: drag its edge to resize; the width is kept', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await addPanelApps(app, [{ url: server.url('/one'), title: 'Desk' }]);
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    expect(await dockWidth(win)).toBe(380);
    await dockSettled(win);

    // Drag the gap before the panel 120 px to the left: the panel widens by as much.
    const edge = (await win.getByTestId('dock-edge').boundingBox())!;
    const y = edge.y + edge.height / 2;
    await win.mouse.move(edge.x + edge.width / 2, y);
    await win.mouse.down();
    await win.mouse.move(edge.x - 60, y, { steps: 5 });
    await win.mouse.move(edge.x - 120 + edge.width / 2, y, { steps: 5 });
    await win.mouse.up();
    await expect.poll(() => dockWidth(win)).toBe(500);
    // The page beside it is live again afterwards (no snapshot left over).
    await expect(win.getByTestId('resize-snapshot')).toHaveCount(0);
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData });
  try {
    const { win } = second;
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    expect(await dockWidth(win)).toBe(500);
    // Double-click: the usual width.
    await win.getByTestId('dock-edge').dblclick();
    await expect.poll(() => dockWidth(win)).toBe(380);
  } finally {
    await second.close();
    await server.close();
  }
});

test('a pinned app opens beside the rail (UI 3): the page stays, Notes can sit on the right too', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  type Box = { x: number; width: number };
  const layout = () =>
    invoke<{ card: Box; appDock: Box | null; notes: Box | null }>(win, 'layout:get');
  try {
    await addPanelApps(app, [{ url: server.url('/one'), title: 'Desk' }], 'left');
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-dock')).toBeVisible();
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page One');
    await expect(win.getByTestId('rail-panel-marker')).toHaveCount(1);
    // It slides in beside the rail and the page makes room (it isn't covered).
    await expect
      .poll(async () => {
        const l = await layout();
        return l.appDock ? l.card.x - (l.appDock.x + l.appDock.width) : null;
      })
      .toBe(10);
    expect((await layout()).appDock!.width).toBe(360);

    // Notes opens on the right while the app stays.
    await win.getByTestId('toolbar-notes').click();
    await expect.poll(async () => (await layout()).notes !== null).toBe(true);
    await expect(win.getByTestId('app-dock')).toBeVisible();

    // Its edge resizes it.
    const edge = (await win.getByTestId('app-dock-edge').boundingBox())!;
    const y = edge.y + edge.height / 2;
    await win.mouse.move(edge.x + edge.width / 2, y);
    await win.mouse.down();
    await win.mouse.move(edge.x + 30, y, { steps: 4 });
    await win.mouse.move(edge.x + 60 + edge.width / 2, y, { steps: 4 });
    await win.mouse.up();
    await expect.poll(async () => (await layout()).appDock?.width).toBe(420);

    // Closing it gives the page its room back; the marker goes.
    await win.getByTestId('app-panel-close').click();
    await expect(win.getByTestId('app-dock')).toHaveCount(0);
    await expect(win.getByTestId('rail-panel-marker')).toHaveCount(0);
  } finally {
    await close();
    await server.close();
  }
});

test('the docked panel switches between this Space’s panel apps; + opens the App Library', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  try {
    await addPanelApps(app, [
      { url: server.url('/one'), title: 'Desk' },
      { url: server.url('/two'), title: 'Mail' },
    ]);
    await win.getByTestId('favorite-tile').first().click();
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page One');
    const switches = win.getByTestId('app-panel-switch');
    await expect(switches).toHaveCount(2);
    await expect(switches.first()).toHaveAttribute('data-current', 'true');
    // One click swaps the app; the panel stays open.
    await switches.nth(1).click();
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page Two');
    await expect(switches.nth(1)).toHaveAttribute('data-current', 'true');
    // The current one does nothing (it doesn't close the panel).
    await switches.nth(1).click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    // Back to the first: as it was (kept loaded).
    await switches.first().click();
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page One');

    // +: the App Library opens over the window.
    await win.getByTestId('app-panel-add').click();
    const overlay = await pageWith(app, '/overlay/');
    await expect(overlay.getByTestId('app-library')).toBeVisible();
    await expect(overlay.getByTestId('app-library-app')).toHaveCount(2);
  } finally {
    await close();
    await server.close();
  }
});

test('a panel app (or tab) that can’t load shows why, with Try Again / Open as Tab / Open in Window', async () => {
  test.setTimeout(90_000);
  const { app, win, close } = await launchOrbit();
  try {
    // A port nothing listens on any more: the connection is refused.
    const port = await freePort();
    await addPanelApps(app, [{ url: `http://127.0.0.1:${port}/`, title: 'Gone' }]);
    await win.getByTestId('favorite-tile').click();
    const card = win.getByTestId('load-error');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Can’t connect');
    await expect(card).toContainText('127.0.0.1 refused the connection');
    // Try Again: still refused, the card comes back.
    await win.getByTestId('load-error-retry').click();
    await expect(card).toContainText('Can’t connect');
    // Open as Tab: the tab shows the same card instead of a blank page.
    await win.getByTestId('load-error-tab').click();
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
    await expect(win.getByTestId('content-card').getByTestId('load-error')).toContainText(
      'Can’t connect',
    );
    // Open in Window: from the panel, the app goes to a small window of its own.
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    const windows = () =>
      app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length,
      );
    const before = await windows();
    await win
      .getByTestId('app-panel-header')
      .locator('..')
      .getByTestId('load-error-window')
      .click();
    await expect.poll(windows).toBe(before + 1);
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('a panel app’s sign-in popup opens as a popup window that can answer the app', async () => {
  test.setTimeout(60_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  try {
    await addPanelApps(app, [{ url: server.url('/opener'), title: 'Sign-in' }]);
    await win.getByTestId('favorite-tile').click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    const count = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    const before = await count();
    // Click the page's Sign in button (window.open with a size: a real popup), once it's there.
    await expect
      .poll(() =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((c) => c.getURL().endsWith('/opener') && !c.isLoading()),
        ),
      )
      .toBe(true);
    await app.evaluate(async ({ webContents }) => {
      const page = webContents.getAllWebContents().find((c) => c.getURL().endsWith('/opener'))!;
      await page.executeJavaScript(`document.getElementById('signin').click()`, true);
    });
    await expect.poll(count).toBe(before + 1);
    // The popup kept window.opener: its message reached the panel's page (its title says so),
    // then it closed itself, as sign-in popups do.
    await expect(win.getByTestId('app-panel-title')).toHaveText('got:signed-in');
    await expect.poll(count).toBe(before);
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
  } finally {
    await close();
    await server.close();
  }
});

test('panel apps are marked in Favorites; an app can show in several chosen Spaces', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  try {
    await addPanelApps(app, [{ url: server.url('/one'), title: 'Desk' }]);
    const tile = win.getByTestId('favorite-tile');
    await expect(tile.getByTestId('favorite-opens-in')).toHaveAttribute('data-open-in', 'panel');
    await expect(tile).toHaveAttribute('aria-label', 'Desk, opens beside the page');

    // Three Spaces: show the app in the first and the last only.
    await clickMenu(app, 'new-space');
    await clickMenu(app, 'new-space');
    const settings = await openSettings(app);
    await settings.locator('[data-testid="settings-nav"][data-section="apps"]').click();
    await settings.getByTestId('app-spaces').click();
    const options = settings.getByTestId('app-space-option');
    await expect(options).toHaveCount(3);
    await options.nth(0).click(); // from Every Space: only this one
    await expect(settings.getByTestId('app-spaces')).toContainText('Only in');
    await options.nth(2).click();
    await expect(settings.getByTestId('app-spaces')).toContainText(' and ');
    await expect(options.nth(1)).toHaveAttribute('data-checked', 'false');
    // The last ticked Space stays ticked.
    await options.nth(0).click();
    await options.nth(2).click();
    await expect(options.nth(2)).toHaveAttribute('data-checked', 'true');
    await options.nth(0).click();
    await settings.keyboard.press('Escape');
    await expect(settings.getByTestId('app-spaces-menu')).toHaveCount(0);
    await closeSettings(app);

    // Now in the third Space (the newest): shown; the second: not (an open panel closes); the
    // first: shown.
    await expect(tile).toHaveCount(1);
    await tile.click();
    await expect(win.getByTestId('app-panel-header')).toBeVisible();
    await invoke(win, 'spaces:cycle', { direction: -1 });
    await expect(tile).toHaveCount(0);
    await expect(win.getByTestId('app-panel-header')).toHaveCount(0);
    await invoke(win, 'spaces:cycle', { direction: -1 });
    await expect(tile).toHaveCount(1);
  } finally {
    await close();
    await server.close();
  }
});

test('App Library: find apps, open one where it’s set to open, add from the catalogue or by address, keyboard', async () => {
  test.setTimeout(90_000);
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit();
  try {
    await addPanelApps(app, [{ url: server.url('/one'), title: 'Desk' }]);
    await clickMenu(app, 'app-library'); // ⇧⌘A
    const overlay = await pageWith(app, '/overlay/');
    const library = overlay.getByTestId('app-library');
    await expect(library).toBeVisible();
    const yours = overlay.getByTestId('app-library-app');
    await expect(yours).toHaveCount(1);
    await expect(yours).toContainText('Opens beside the page');

    // Search filters at once; a catalogue app is added and shows as yours.
    await overlay.getByTestId('app-library-search').fill('claude');
    const claude = overlay.getByTestId('app-library-catalog').filter({ hasText: 'Claude' });
    await expect(claude).toHaveAttribute('data-added', 'false');
    await claude.click();
    await expect(claude).toHaveAttribute('data-added', 'true');
    await expect(overlay.getByTestId('app-library-app').filter({ hasText: 'Claude' })).toHaveCount(
      1,
    );
    await expect(win.getByTestId('favorite-tile')).toHaveCount(2);

    // A site that isn't listed: add it by its address.
    await overlay.getByTestId('app-library-search').fill('example.org');
    await overlay.getByTestId('app-library-add-typed').click();
    await expect(
      overlay.getByTestId('app-library-app').filter({ hasText: 'example.org' }),
    ).toHaveCount(1);

    // Keyboard: ↓ from the search box to the first tile, ⏎ opens it (Desk → the side panel).
    await overlay.getByTestId('app-library-search').fill('desk');
    await overlay.getByTestId('app-library-search').press('ArrowDown');
    await overlay.keyboard.press('Enter');
    await expect(library).toHaveCount(0);
    await expect(win.getByTestId('app-panel-title')).toHaveText('Page One');

    // The open app says so next time; Manage in Settings goes to Settings → Apps; Esc closes.
    await clickMenu(app, 'app-library');
    await expect(
      overlay.getByTestId('app-library-app').filter({ hasText: 'Desk' }),
    ).toHaveAttribute('data-open', 'true');
    await overlay.keyboard.press('Escape');
    await expect(library).toHaveCount(0);
    await clickMenu(app, 'app-library');
    await overlay.getByTestId('app-library-settings').click();
    await expect.poll(() => app.windows().some((p) => p.url().includes('#/settings'))).toBe(true);
  } finally {
    await close();
    await server.close();
  }
});
