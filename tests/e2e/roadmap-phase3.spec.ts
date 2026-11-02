import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import { startTestServer } from './test-server';

/**
 * Roadmap Phase 3 acceptance: "AI completes a few useful, clearly defined workflows with user
 * permission, reliable source references, and transparent data handling" — and the local
 * creative and developer tools work. Then a restart: what you kept is there, the conversation
 * (memory only) is not, and the log of what was sent remains.
 */
type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
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
const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';

test('Phase 3: ask about a page with sources, keep the answer and its tasks, across a restart', async () => {
  const server = await startTestServer();
  const env = { ORBIT_ANTHROPIC_BASE_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' };
  const first = await launchOrbit({ env });
  const { userData } = first;
  try {
    const { app, win } = first;
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await invoke(settings, 'ai:setKey', { key: KEY });
    await closeSettings(app);

    // Explicit: the page goes only when asked — here, "Summarize Page" from the View menu.
    await invoke(win, 'tabs:create', { url: server.url('/article') });
    await pageWith(app, '/article');
    expect(server.aiRequests()).toHaveLength(0);
    await clickMenu(app, 'summarize-page');
    const panel = await pageWith(app, '#/notes/panel/assistant');
    const answer = panel.getByTestId('assistant-answer').last();
    await expect(answer).toHaveAttribute('data-status', 'done');
    // Reliable sources: the cited words are the page's own.
    await expect(answer.getByTestId('assistant-source')).toContainText(
      'Grids give a layout rhythm and make pages easier to scan.',
    );

    // Keep it: the answer as a note; the page's to-dos as tasks.
    await answer.getByTestId('assistant-save-note').click();
    await expect(win.getByTestId('toolbar-toast')).toContainText('Saved to Notes');
    await panel.getByTestId('assistant-clear').click();
    await panel.getByTestId('assistant-page-tasks').click();
    await expect(panel.getByTestId('assistant-task-title')).toHaveCount(2);
    await panel.getByTestId('assistant-tasks-add').click();
    await expect(win.getByTestId('toolbar-toast')).toContainText('Added 2 tasks');

    // Local tools need no AI: a colour from the page, its contrast checked.
    await invoke(win, 'tabs:create', { url: server.url('/colors') });
    await pageWith(app, '/colors');
    await clickMenu(app, 'pick-color');
    const bar = await pageWith(app, '/overlay/');
    await expect(bar.getByTestId('color-pick-layer')).toBeVisible();
    const size = await bar.evaluate('[innerWidth, innerHeight]');
    const [w, h] = size as [number, number];
    await bar.mouse.click(w / 2, h - 80);
    await expect(win.getByTestId('toolbar-toast')).toContainText('Copied #5b5bd6');
  } finally {
    await first.close({ keepData: true });
  }

  // After a restart: the note and tasks are there; the conversation isn't; the log is.
  const second = await launchOrbit({ userData, env });
  try {
    const { app, win } = second;
    await invoke(win, 'notes:panel', { view: 'tasks' });
    const panel = await pageWith(app, '#/notes/panel');
    await expect(
      panel.getByTestId('task-row').filter({ hasText: 'Audit the spacing' }),
    ).toHaveCount(1);
    const notes = (await invoke(panel, 'notes:list', { query: 'Summarize this page' })) as {
      notes: { title: string }[];
    };
    expect(notes.notes.map((n) => n.title)).toContain('Summarize this page');
    await clickMenu(app, 'assistant');
    const assistant = await pageWith(app, '#/notes/panel/assistant');
    await expect(assistant.getByTestId('assistant-welcome')).toBeVisible();
    await expect(assistant.getByTestId('assistant-answer')).toHaveCount(0);
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="ai"]').click();
    await expect(settings.getByTestId('ai-activity-entry')).toHaveCount(2);
    await expect(settings.getByTestId('ai-activity-entry').first()).toContainText(
      'Tasks from text',
    );
  } finally {
    await second.close();
    await server.close();
  }
});
