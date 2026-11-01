import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
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

test('pin with ⌘D, favorites, folders — and it all survives a relaunch', async () => {
  const first = await launchOrbit();
  const { app, win } = first;
  await invoke(win, 'tabs:create', { url: server.url('/one') });
  await invoke(win, 'tabs:create', { url: server.url('/two') });
  const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
  const pinned = win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]');
  await expect(today).toHaveText(['Page Two', 'Page One', 'New Tab']);

  // ⌘D pins the active tab (Page Two).
  await clickMenu(app, 'toggle-pin');
  await expect(pinned).toHaveText(['Page Two']);
  await expect(today).toHaveText(['Page One', 'New Tab']);

  // Make Page One a favorite (as a drag onto the grid would).
  const oneId = await today.first().getAttribute('data-tab-id');
  await invoke(win, 'sidebar:move', {
    itemId: oneId,
    section: 'favorite',
    parentId: null,
    beforeId: null,
  });
  await expect(win.getByTestId('favorite-tile')).toHaveCount(1);
  await expect(win.getByTestId('favorite-tile')).toHaveAttribute('aria-label', 'Page One');

  // New folder (opens inline rename), then put the pinned tab inside it.
  await clickMenu(app, 'new-folder');
  await win.getByTestId('rename-input').fill('The Wood');
  await win.getByTestId('rename-input').press('Enter');
  const folder = win.getByTestId('folder-row');
  await expect(folder).toHaveText('The Wood');
  const twoId = await pinned.first().getAttribute('data-tab-id');
  const folderId = await invoke<{ pinned: { id: string; kind: string }[] }>(
    win,
    'sidebar:get',
  ).then((s) => s.pinned.find((r) => r.kind === 'folder')!.id);
  await invoke(win, 'sidebar:move', {
    itemId: twoId,
    section: 'pinned',
    parentId: folderId,
    beforeId: null,
  });
  await expect(pinned).toHaveText(['Page Two']);

  // Collapse hides the tab inside.
  await folder.click();
  await expect(pinned).toHaveCount(0);
  await today.first().click(); // quit with a Today tab active, so the pinned one restores unloaded
  await first.close({ keepData: true });

  const second = await launchOrbit({ userData: first.userData });
  try {
    await expect(second.win.getByTestId('folder-row')).toHaveText('The Wood');
    await expect(second.win.getByTestId('folder-row')).toHaveAttribute('aria-expanded', 'false');
    await expect(second.win.getByTestId('favorite-tile')).toHaveCount(1);
    await second.win.getByTestId('folder-row').click();
    // Pinned tabs are restored unloaded (greyed) until clicked.
    const pinnedRow = second.win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]');
    await expect(pinnedRow).toHaveAttribute('data-live', 'false');
    await pinnedRow.click();
    await expect(pinnedRow).toHaveAttribute('data-live', 'true');
  } finally {
    await second.close();
  }
});

test('spaces: create and rename, switch with ⌃1/⌃2, each keeps its own tabs', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await expect(today).toHaveText(['Page One', 'New Tab']);

    await clickMenu(app, 'new-space');
    await expect(win.getByTestId('space-button')).toHaveCount(2);
    await win.getByTestId('rename-input').fill('Work');
    await win.getByTestId('rename-input').press('Enter');
    await expect(win.getByTestId('space-name')).toHaveText('Work');
    await expect(today).toHaveCount(0); // a new space starts empty

    await invoke(win, 'tabs:create', { url: server.url('/two') });
    await expect(today).toHaveText(['Page Two']);

    await clickMenu(app, 'go-to-space-1');
    await expect(win.getByTestId('space-name')).toHaveText('Personal');
    await expect(today).toHaveText(['Page One', 'New Tab']);
    // The space remembers which tab was open.
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');

    await clickMenu(app, 'next-space');
    await expect(win.getByTestId('space-name')).toHaveText('Work');
    await expect(win.getByTestId('toolbar-address')).toContainText('Page Two');
  } finally {
    await orbit.close();
  }
});

test('Clear closes Today tabs; ⇧⌘T brings them back', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await expect(today).toHaveCount(2);
    await win.getByTestId('clear-today').click();
    await expect(today).toHaveCount(0);
    await expect(win.getByTestId('toolbar-toast')).toContainText('Cleared 2 tabs');
    await clickMenu(app, 'reopen-tab');
    await expect(today).toHaveCount(1);
  } finally {
    await orbit.close();
  }
});
