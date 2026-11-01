import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

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

/** The first page (window or view) whose URL contains `fragment`. */
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}

/** Types into a note editor: the first line is the title. */
async function write(page: Page, lines: string[]) {
  const editor = page.getByTestId('note-editor');
  await editor.click();
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
}

const layoutNotes = (win: Page) =>
  invoke<{ notes: { width: number } | null }>(win, 'layout:get').then((l) => l.notes);

test('the Notes panel docks beside the page; notes are written, listed, searched', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    expect(await layoutNotes(win)).toBeNull();
    await win.getByTestId('toolbar-notes').click();
    await expect.poll(() => layoutNotes(win)).toMatchObject({ width: 380 });
    await expect(win.getByTestId('toolbar-notes')).toHaveAttribute('aria-pressed', 'true');

    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('notes-empty-new').click();
    await write(panel, ['Groceries', 'milk and eggs']);
    await panel.getByTestId('notes-back').click();
    await expect(panel.getByTestId('notes-item')).toHaveCount(1);
    await expect(panel.getByTestId('notes-item')).toContainText('Groceries');
    await expect(panel.getByTestId('notes-item')).toContainText('milk and eggs');

    // An empty note is dropped on the way back to the list.
    await panel.getByTestId('notes-new').click();
    await expect(panel.getByTestId('note-editor')).toBeVisible();
    await panel.getByTestId('notes-back').click();
    await expect(panel.getByTestId('notes-item')).toHaveCount(1);

    await panel.getByTestId('notes-search').fill('eggs');
    await expect(panel.getByTestId('notes-item')).toHaveCount(1);
    await panel.getByTestId('notes-search').fill('bread');
    await expect(panel.getByTestId('notes-item')).toHaveCount(0);

    // ⇧⌘N hides it, and the page gets its width back.
    await clickMenu(app, 'toggle-notes');
    await expect.poll(() => layoutNotes(win)).toBeNull();
  } finally {
    await orbit.close();
  }
});

test('a quick note pops up over the page and lands in the panel', async () => {
  const orbit = await launchOrbit();
  try {
    const { app } = orbit;
    await clickMenu(app, 'quick-note');
    const overlay = await pageWith(app, '/overlay/');
    await expect(overlay.getByTestId('quick-note')).toBeVisible();
    await expect(overlay.getByTestId('note-editor')).toBeFocused();
    await overlay.keyboard.type('Call the bank');
    await overlay.keyboard.press('Enter');
    await overlay.keyboard.type('before Friday');
    // Typing at once loses nothing (the note's load doesn't overwrite it).
    await expect(overlay.getByTestId('note-editor')).toContainText('Call the bankbefore Friday');
    await overlay.keyboard.press('Escape');
    await expect(overlay.getByTestId('quick-note')).toHaveCount(0);

    // An empty quick note leaves nothing behind.
    await clickMenu(app, 'quick-note');
    await expect(overlay.getByTestId('quick-note')).toBeVisible();
    await overlay.keyboard.press('Escape');
    await expect(overlay.getByTestId('quick-note')).toHaveCount(0);

    await clickMenu(app, 'toggle-notes');
    const panel = await pageWith(app, '#/notes/panel');
    await expect(panel.getByTestId('notes-item')).toHaveCount(1);
    await expect(panel.getByTestId('notes-item')).toContainText('Call the bank');
  } finally {
    await orbit.close();
  }
});

test('a note floats on top in its own window, stays in step, and can be pinned', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await win.getByTestId('toolbar-notes').click();
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('notes-empty-new').click();
    await write(panel, ['Trip ideas', 'Lisbon']);
    await panel.getByTestId('note-to-float').click();

    const float = await pageWith(app, '#/notes/float/');
    await expect(float.getByTestId('note-editor')).toContainText('Lisbon');
    const onTop = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .filter((w) => w.webContents.getURL().includes('#/notes/float/'))
          .map((w) => w.isAlwaysOnTop()),
      );
    expect(await onTop()).toEqual([true]);
    await float.getByTestId('note-pin').click();
    await expect.poll(onTop).toEqual([false]);

    // Typed in the floating note, it shows in the panel's list too.
    await float.getByTestId('note-editor').click();
    await float.keyboard.press('End');
    await float.keyboard.press('Enter');
    await float.keyboard.type('Porto');
    await expect(panel.getByTestId('notes-item')).toContainText('Lisbon Porto');
  } finally {
    await orbit.close();
  }
});

test('a note opens as a tab named after it, and can be pinned like any tab', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await clickMenu(app, 'new-note');
    const tab = await pageWith(app, '#/note/');
    await expect(tab.getByTestId('note-editor')).toBeFocused();
    await tab.keyboard.type('Reading list');
    await tab.keyboard.press('Enter');
    await tab.keyboard.type('[ ] ');
    await tab.keyboard.type('Dune');
    await expect(tab.locator('ul[data-type="taskList"] li')).toHaveCount(1);

    const today = win.locator('[data-testid="tab-list"] [data-testid="tab-row"]');
    await expect(today.first()).toHaveText('Reading list');
    await clickMenu(app, 'toggle-pin');
    await expect(win.locator('[data-testid="pinned-list"] [data-testid="tab-row"]')).toHaveText([
      'Reading list',
    ]);
  } finally {
    await orbit.close();
  }
});

test('floating notes come back after a relaunch', async () => {
  const first = await launchOrbit();
  const { userData } = first;
  try {
    await clickMenu(first.app, 'float-note');
    const float = await pageWith(first.app, '#/notes/float/');
    await write(float, ['Sticky', 'stays put']);
    await expect
      .poll(() =>
        first.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) =>
            w.webContents.getURL().includes('#/notes/float/'),
          ),
        ),
      )
      .toBe(true);
    await float.waitForTimeout(600); // the note saves
  } finally {
    await first.close({ keepData: true });
  }
  const second = await launchOrbit({ userData });
  try {
    const float = await pageWith(second.app, '#/notes/float/');
    await expect(float.getByTestId('note-editor')).toContainText('stays put');
  } finally {
    await second.close();
  }
});

/** Answers "Delete …?" with Delete. */
const confirmDeletes = (app: ElectronApplication) =>
  app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  });
const floatCount = (app: ElectronApplication) =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('#/notes/float/'))
        .length,
  );

test('every button in the panel works: format, open as tab, float, delete, close', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await confirmDeletes(app);
    await win.getByTestId('toolbar-notes').click();
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('notes-empty-new').click();
    await write(panel, ['Formatting']);
    await panel.keyboard.press('Enter');
    await panel.getByTestId('note-checklist').click();
    await panel.keyboard.type('a task');
    await expect(panel.locator('ul[data-type="taskList"] li')).toHaveCount(1);
    await panel.getByRole('button', { name: 'Bold (⌘B)' }).click();
    await panel.keyboard.type(' strong');
    await expect(panel.locator('.ProseMirror strong')).toHaveText('strong');

    // Open as Tab: a tab shows it, the panel goes back to its list.
    await panel.getByTestId('note-to-tab').click();
    const tab = await pageWith(app, '#/note/');
    await expect(tab.getByTestId('note-editor')).toContainText('a task strong');
    await expect(panel.getByTestId('notes-item')).toHaveCount(1);

    // Both open at once stay in step: typed in the tab, it shows in the panel's editor.
    await panel.getByTestId('notes-item').click();
    await tab.getByTestId('note-editor').click();
    await tab.keyboard.press('End');
    await tab.keyboard.type(' synced');
    await expect(panel.getByTestId('note-editor')).toContainText('strong synced');

    // Float from the panel, then delete from the panel: the tab and the float go too.
    await panel.getByTestId('note-to-float').click();
    await expect.poll(() => floatCount(app)).toBe(1);
    await panel.getByTestId('notes-item').click();
    await panel.getByTestId('note-delete').click();
    await expect(panel.getByTestId('notes-item')).toHaveCount(0);
    await expect.poll(() => floatCount(app)).toBe(0);
    await expect(win.locator('[data-testid="tab-row"]', { hasText: 'Formatting' })).toHaveCount(0);

    await panel.getByTestId('notes-close').click();
    await expect.poll(() => layoutNotes(win)).toBeNull();
  } finally {
    await orbit.close();
  }
});

test('every button in the quick note works: to panel, to tab, float; ⌃⇧N toggles', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const overlay = await pageWith(app, '/overlay/');
    const quick = overlay.getByTestId('quick-note');

    await clickMenu(app, 'quick-note');
    await expect(quick).toBeVisible();
    await overlay.keyboard.type('To the panel');
    await overlay.getByTestId('note-to-panel').click();
    await expect(quick).toHaveCount(0);
    const panel = await pageWith(app, '#/notes/panel');
    await expect(panel.getByTestId('note-editor')).toContainText('To the panel');

    await clickMenu(app, 'quick-note');
    await expect(quick).toBeVisible();
    await overlay.keyboard.type('To a tab');
    await overlay.getByTestId('note-to-tab').click();
    await expect(quick).toHaveCount(0);
    await expect(win.locator('[data-testid="tab-row"]', { hasText: 'To a tab' })).toHaveCount(1);

    await clickMenu(app, 'quick-note');
    await expect(quick).toBeVisible();
    await overlay.keyboard.type('Floating away');
    await overlay.getByTestId('note-to-float').click();
    await expect(quick).toHaveCount(0);
    const float = await pageWith(app, '#/notes/float/');
    await expect(float.getByTestId('note-editor')).toContainText('Floating away');

    // ⌃⇧N again closes it; a click outside does too.
    await clickMenu(app, 'quick-note');
    await expect(quick).toBeVisible();
    await clickMenu(app, 'quick-note');
    await expect(quick).toHaveCount(0);
    await clickMenu(app, 'quick-note');
    await overlay.getByTestId('quick-note-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(quick).toHaveCount(0);
  } finally {
    await orbit.close();
  }
});

test('floating and tab notes: their buttons move, pin and delete; ⌘-click opens links', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await confirmDeletes(app);
    await clickMenu(app, 'float-note');
    const float = await pageWith(app, '#/notes/float/');
    await write(float, ['Float to Orbit']);
    await float.getByTestId('note-to-panel').click();
    await expect.poll(() => floatCount(app)).toBe(0);
    const panel = await pageWith(app, '#/notes/panel');
    await expect(panel.getByTestId('note-editor')).toContainText('Float to Orbit');

    await clickMenu(app, 'new-note');
    const tab = await pageWith(app, '#/note/');
    await expect(tab.getByTestId('note-editor')).toBeFocused();
    await tab.keyboard.type('Tab note https://example.com/ ');
    await tab.getByTestId('note-to-float').click();
    await expect.poll(() => floatCount(app)).toBe(1);
    await tab.getByTestId('note-to-panel').click();
    await expect(panel.getByTestId('note-editor')).toContainText('Tab note');

    // ⌘-click on a link opens it as a tab.
    await tab.locator('.ProseMirror a').click({ modifiers: ['Meta'] });
    await expect
      .poll(() => app.windows().some((p) => p.url().startsWith('https://example.com')))
      .toBe(true);

    await tab.getByTestId('note-delete').click();
    await expect(win.locator('[data-testid="tab-row"]', { hasText: 'Tab note' })).toHaveCount(0);
    await expect.poll(() => floatCount(app)).toBe(0);
  } finally {
    await orbit.close();
  }
});
