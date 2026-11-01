import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

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
const sidebarShown = (win: Page) =>
  invoke<{ sidebar: { visible: boolean } }>(win, 'layout:get').then((l) => l.sidebar.visible);

test('Focus on a task: the pill counts down, the sidebar steps aside, ✓ ticks it off', async () => {
  const first = await launchOrbit();
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('project-card').filter({ hasText: 'KraitiveSon' }).click();
    const row = panel.getByTestId('task-row').filter({ hasText: 'Edit YouTube video' });
    await row.hover();
    await row.getByTestId('task-focus').click();

    const pill = win.getByTestId('focus-pill');
    await expect(pill).toBeVisible();
    await expect(win.getByTestId('focus-title')).toHaveText('Edit YouTube video');
    await expect(win.getByTestId('focus-clock')).toHaveText(/^2[45]:\d\d$/);
    await expect.poll(() => sidebarShown(win)).toBe(false);
    await expect(row).toContainText('In Progress');
  } finally {
    await first.close({ keepData: true });
  }

  // Still focusing after a restart; ✓ finishes it.
  const second = await launchOrbit({ userData });
  try {
    const { app, win } = second;
    await expect(win.getByTestId('focus-pill')).toBeVisible();
    await expect(win.getByTestId('focus-title')).toHaveText('Edit YouTube video');
    await win.getByTestId('focus-done').click();
    await expect(win.getByTestId('focus-pill')).toHaveCount(0);
    await expect.poll(() => sidebarShown(win)).toBe(true);
    await expect(win.getByTestId('toolbar-toast')).toContainText('Done');
    await invoke(win, 'notes:panel', { view: 'tasks' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.locator('[data-testid="task-filters"] [data-filter="completed"]').click();
    await expect(
      panel
        .getByTestId('task-list')
        .getByTestId('task-row')
        .filter({ hasText: 'Edit YouTube video' }),
    ).toHaveCount(1);
  } finally {
    await second.close();
  }
});

test('Start Focus from ⌘T picks up where you left off; End just stops', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await panel.getByTestId('project-card').filter({ hasText: 'SIRATEQ' }).click();
    await expect(panel.getByTestId('project-title')).toHaveText('SIRATEQ Brand Guide');

    await invoke(win, 'commandbar:open', { mode: 'new' });
    const bar = await pageWith(app, '/overlay/');
    await bar.getByTestId('command-input').fill('Start Focus');
    await bar.locator('[data-testid="command-item"][data-kind="command"]').first().click();
    await expect(win.getByTestId('focus-title')).toHaveText('Finish brand guide');

    await win.getByTestId('focus-end').click();
    await expect(win.getByTestId('focus-pill')).toHaveCount(0);
    await expect(win.getByTestId('toolbar-toast')).toContainText('Focus ended');
  } finally {
    await orbit.close();
  }
});
