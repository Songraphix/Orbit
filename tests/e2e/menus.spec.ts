import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = <T = unknown>(page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
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
/** Picks an item from the next native menu Orbit builds (a sidebar item's menu). */
const pickNextMenu = (app: ElectronApplication, label: string) =>
  app.evaluate(({ Menu }, l) => {
    const original = Menu.buildFromTemplate;
    Menu.buildFromTemplate = ((template: { label?: string; click?: () => void }[]) => {
      Menu.buildFromTemplate = original;
      template.find((i) => i.label === l)?.click?.();
      return { popup: () => undefined };
    }) as never;
  }, label);
const todayTitles = (win: Page) =>
  invoke<{ today: { title: string }[] }>(win, 'sidebar:get').then((s) =>
    s.today.map((r) => r.title),
  );

const rightClickAndPick = (
  app: ElectronApplication,
  fragment: string,
  params: Record<string, unknown>,
  label: string,
) =>
  app.evaluate(
    ({ Menu, webContents }, [f, p, l]) => {
      let picked = false;
      const original = Menu.buildFromTemplate;
      Menu.buildFromTemplate = ((template: { label?: string; click?: () => void }[]) => {
        Menu.buildFromTemplate = original;
        const item = template.find((i) => i.label === l);
        item?.click?.();
        picked = item !== undefined;
        return { popup: () => undefined };
      }) as never;
      const page = webContents.getAllWebContents().find((w) => w.getURL().includes(f))!;
      page.emit(
        'context-menu',
        { preventDefault: () => undefined },
        {
          x: 10,
          y: 10,
          linkURL: '',
          linkText: '',
          srcURL: '',
          mediaType: 'none',
          selectionText: '',
          isEditable: false,
          misspelledWord: '',
          dictionarySuggestions: [],
          editFlags: {
            canUndo: false,
            canRedo: false,
            canCut: false,
            canCopy: true,
            canPaste: false,
            canSelectAll: true,
          },
          ...p,
        },
      );
      return picked;
    },
    [fragment, params, label] as const,
  );

test('menus: Explain and Translate with Orbit AI, Open in Split View, tab actions, the Homepage’s menu', async () => {
  test.setTimeout(120_000);
  const server = await startTestServer();
  const orbit = await launchOrbit({
    env: { ORBIT_ANTHROPIC_BASE_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' },
  });
  try {
    const { app, win } = orbit;
    // The Homepage's own menu (no AI key needed): Edit Widgets, Shuffle Background.
    const home = await pageWith(app, '#/newtab');
    await home.getByTestId('newtab').waitFor();
    const before = await home.getByTestId('wallpaper').getAttribute('data-key');
    await home.getByTestId('newtab').click({ button: 'right', position: { x: 40, y: 300 } });
    await expect(home.getByTestId('home-menu')).toBeVisible();
    await home.locator('[data-testid="home-menu-item"][data-action="shuffle"]').click();
    await expect(home.getByTestId('home-menu')).toHaveCount(0);
    await expect
      .poll(() => home.getByTestId('wallpaper').getAttribute('data-key'))
      .not.toBe(before);
    await home.getByTestId('newtab').click({ button: 'right', position: { x: 40, y: 300 } });
    await home.keyboard.press('ArrowDown');
    await home.keyboard.press('Enter'); // the second item: Edit Widgets
    await expect(home.getByTestId('widgets-toolbar')).toBeVisible();

    // Explain with Orbit AI: the selection and the question go together (with a key).
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await invoke(settings, 'ai:setKey', { key: 'sk-ant-test-0123456789abcdefghijklmnop' });
    await clickMenu(app, 'close-tab');
    await invoke(win, 'tabs:create', { url: server.url('/article') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Grid Systems');
    expect(
      await rightClickAndPick(
        app,
        '/article',
        { selectionText: 'Use an 8 pt baseline' },
        'Explain with Orbit AI',
      ),
    ).toBe(true);
    const panel = await pageWith(app, '#/notes/panel/assistant');
    await expect(panel.getByTestId('assistant-answer').last()).toHaveAttribute(
      'data-status',
      'done',
    );
    const sent = JSON.stringify(server.lastAiRequest()!.body['messages']);
    expect(sent).toContain('Use an 8 pt baseline');
    expect(sent).toContain('Explain this selection in plain words');
    expect(
      await rightClickAndPick(
        app,
        '/article',
        { selectionText: 'Hola mundo' },
        'Translate with Orbit AI',
      ),
    ).toBe(true);
    await expect
      .poll(() => JSON.stringify(server.lastAiRequest()!.body['messages']))
      .toContain('Translate this selection into');

    // Open in Split View from the page's menu.
    expect(await rightClickAndPick(app, '/article', {}, 'Open in Split View')).toBe(true);
    await expect
      .poll(() => invoke<{ split: unknown }>(win, 'tabs:get').then((t) => t.split !== null))
      .toBe(true);
    await clickMenu(app, 'exit-split');

    // A tab's menu: Duplicate, then Close Other Today Tabs.
    const article = (
      await invoke<{ tabs: { id: string; url: string }[] }>(win, 'tabs:get')
    ).tabs.find((t) => t.url.includes('/article'))!;
    const tabs = { activeTabId: article.id };
    await pickNextMenu(app, 'Duplicate');
    await invoke(win, 'sidebar:itemMenu', { itemId: tabs.activeTabId });
    await expect
      .poll(async () => (await todayTitles(win)).filter((t) => t === 'Grid Systems').length)
      .toBe(2);
    await pickNextMenu(app, 'Close Other Today Tabs');
    await invoke(win, 'sidebar:itemMenu', { itemId: tabs.activeTabId });
    await expect.poll(() => todayTitles(win)).toEqual(['Grid Systems']);
    await pickNextMenu(app, 'Reopen Closed Tab');
    await invoke(win, 'sidebar:itemMenu', { itemId: tabs.activeTabId });
    await expect.poll(async () => (await todayTitles(win)).length).toBe(2);
  } finally {
    await orbit.close();
    await server.close();
  }
});
