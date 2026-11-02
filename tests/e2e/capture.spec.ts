import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (win: Page, channel: string, input: unknown = {}) =>
  win.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
/** Selects an element's text in the web page. */
const select = (page: Page, id: string) =>
  page.evaluate(`(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(${JSON.stringify(id)}));
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
  })()`);

let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer();
});
test.afterEach(async () => {
  await server?.close();
});

test('⇧⌘S saves a selection to a project; it becomes a task from Research', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/research') });
    const site = await pageWith(app, '/research');
    await select(site, 'quote');

    await clickMenu(app, 'capture');
    const bar = await pageWith(app, '/overlay/');
    const card = bar.getByTestId('capture-card');
    await expect(card).toBeVisible();
    await expect(bar.getByTestId('capture-kind-text')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('capture-preview')).toContainText('Grids give rhythm.');
    await expect(bar.getByTestId('capture-preview')).toContainText('Layout Basics');
    await bar.getByTestId('capture-project').selectOption({ label: 'SIRATEQ Brand Guide' });
    await bar.getByTestId('capture-comment').fill('Use the 8 pt grid');
    await bar.getByTestId('capture-comment').press('Enter');
    await expect(card).toHaveCount(0);
    await expect(win.getByTestId('toolbar-toast')).toContainText('Saved to SIRATEQ Brand Guide');

    // The project's Research shows it; Make Task opens the form filled in.
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('project-card').filter({ hasText: 'SIRATEQ' }).click();
    const row = panel.getByTestId('project-research').getByTestId('research-row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('research-label')).toHaveText('Use the 8 pt grid');
    await row.getByTestId('more-menu').click();
    await panel.getByTestId('research-make-task').click();
    await expect(panel.getByTestId('task-title')).toHaveValue('Use the 8 pt grid');
    await expect(panel.getByTestId('task-description')).toHaveValue(/Grids give rhythm\./);
    await expect(panel.getByTestId('task-description')).toHaveValue(/Source: Layout Basics/);
    await panel.getByTestId('form-save').click();
    await expect(row.getByTestId('research-has-task')).toBeVisible();
    await expect(
      panel
        .getByTestId('project-tasks')
        .getByTestId('task-row')
        .filter({ hasText: 'Use the 8 pt grid' }),
    ).toHaveCount(1);

    // Its sheet shows all of it and moves it to Unsorted.
    await row.getByTestId('research-open').click();
    await expect(panel.getByTestId('research-sheet')).toContainText('Use an 8 pt baseline.');
    await panel.getByTestId('research-move').selectOption({ label: 'Unsorted' });
    await panel.keyboard.press('Escape');
    await expect(panel.getByTestId('project-research').getByTestId('research-row')).toHaveCount(0);
    await panel.getByTestId('project-back').click();
    await panel.getByTestId('unsorted-research').click();
    await expect(panel.getByTestId('research-list').getByTestId('research-row')).toHaveCount(1);
  } finally {
    await orbit.close();
  }
});

test('code snippets keep their language; the page, a screenshot and a task in one go', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/research') });
    const site = await pageWith(app, '/research');
    const bar = await pageWith(app, '/overlay/');

    // A code selection is a snippet, with its language.
    await select(site, 'code');
    await clickMenu(app, 'capture');
    await expect(bar.getByTestId('capture-preview')).toContainText('const grid = 8;');
    await expect(bar.getByTestId('capture-preview')).toContainText('ts');
    await bar.getByTestId('capture-save').click();
    await expect(bar.getByTestId('capture-card')).toHaveCount(0);

    // The page itself (from the toolbar's Save to Orbit button), with a task at the same time.
    await site.evaluate('window.getSelection().removeAllRanges()');
    await win.getByTestId('toolbar-capture').click();
    await expect(bar.getByTestId('capture-kind-link')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('capture-kind-text')).toBeDisabled();
    await bar.getByText('Also add a task').click();
    await expect(bar.getByTestId('capture-make-task')).toBeChecked();
    await bar.getByTestId('capture-save').click();
    await expect(win.getByTestId('toolbar-toast')).toContainText('task added');
    await expect(bar.getByTestId('capture-card')).toHaveCount(0); // closed before the next one

    // A screenshot: the card steps aside; a click takes the whole page; it comes back.
    await clickMenu(app, 'capture');
    await bar.getByTestId('capture-comment').fill('Hero layout');
    await bar.getByTestId('capture-kind-image').click();
    await expect(bar.getByTestId('capture-layer')).toBeVisible();
    await bar.getByTestId('capture-layer').click({ position: { x: 300, y: 200 } });
    await expect(bar.getByTestId('capture-kind-image')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('capture-preview').locator('img')).toBeVisible();
    await expect(bar.getByTestId('capture-comment')).toHaveValue('Hero layout'); // kept
    await bar.getByTestId('capture-save').click();

    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('unsorted-research').click();
    const rows = panel.getByTestId('research-list').getByTestId('research-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-kind', 'image');
    await expect(rows.nth(0).locator('img')).toBeVisible();
    await expect(rows.nth(1)).toHaveAttribute('data-kind', 'link');
    await expect(rows.nth(1).getByTestId('research-has-task')).toBeVisible();
    await expect(rows.nth(2)).toHaveAttribute('data-kind', 'code');
    // The task made with the page is in Tasks, saying where it came from.
    await panel.locator('[data-testid="panel-tab"][data-tab="tasks"]').click();
    await expect(
      panel
        .getByTestId('task-list')
        .getByTestId('task-row')
        .filter({ hasText: 'Follow up: Layout Basics' }),
    ).toHaveCount(1);
  } finally {
    await orbit.close();
  }
});

/** Right-clicks the web page (emits Chromium's context-menu event) and picks `label`. */
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

test('the page’s right-click menu saves a selection or a link to Orbit', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'tabs:create', { url: server.url('/research') });
    const site = await pageWith(app, '/research');
    const bar = await pageWith(app, '/overlay/');

    await select(site, 'quote');
    expect(
      await rightClickAndPick(
        app,
        '/research',
        { selectionText: 'Grids give rhythm. Use an 8 pt baseline.' },
        'Save Selection to Orbit…',
      ),
    ).toBe(true);
    await expect(bar.getByTestId('capture-kind-text')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('capture-preview')).toContainText('Grids give rhythm.');
    await bar.keyboard.press('Escape');
    await expect(bar.getByTestId('capture-card')).toHaveCount(0);

    expect(
      await rightClickAndPick(
        app,
        '/research',
        { linkURL: 'https://example.com/grid-guide', linkText: 'The grid guide' },
        'Save Link to Orbit…',
      ),
    ).toBe(true);
    await expect(bar.getByTestId('capture-kind-link')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('capture-preview')).toContainText('The grid guide');
    await expect(bar.getByTestId('capture-preview')).toContainText(
      'https://example.com/grid-guide',
    );
    await bar.getByTestId('capture-save').click();
    await expect(win.getByTestId('toolbar-toast')).toContainText('Saved to');
  } finally {
    await orbit.close();
  }
});
