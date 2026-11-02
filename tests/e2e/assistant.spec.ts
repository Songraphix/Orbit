import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import type { Orbit } from './launch-orbit';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

let orbit: Orbit;
let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer();
  // Development-only switches: the SDK talks to the test server, and the key skips the Keychain.
  orbit = await launchOrbit({
    env: { ORBIT_ANTHROPIC_BASE_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' },
  });
});
test.afterEach(async () => {
  await orbit?.close();
  await server?.close();
});

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

/** Saves the key through Settings → AI, then closes Settings. */
async function addKey(app: ElectronApplication) {
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await invoke(settings, 'ai:setKey', { key: KEY });
  await clickMenu(app, 'close-tab');
}

const sentText = (body: Record<string, unknown>) => JSON.stringify(body['messages']);

test('Ask Orbit: a summary with sources, follow-ups, notes; nothing sent until you ask', async () => {
  const { app, win } = orbit;
  await addKey(app);
  await invoke(win, 'tabs:create', { url: server.url('/article') });
  const article = await pageWith(app, '/article');

  // ⌘J (the toolbar's ✦) opens the assistant in the panel. Nothing has been sent.
  await win.getByTestId('toolbar-assistant').click();
  const panel = await pageWith(app, '#/notes/panel/assistant');
  await expect(panel.getByTestId('assistant-welcome')).toBeVisible();
  await expect(panel.locator('[data-testid="panel-tab"][data-tab="assistant"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(panel.getByTestId('assistant-model')).toHaveText('Claude Opus 5.5');
  await expect(panel.getByTestId('assistant-attach-page')).toBeVisible(); // offered, not attached
  expect(server.aiRequests()).toHaveLength(0);

  // Summarize: the page's readable text goes (not its menu or footer), with citations on.
  await panel.getByTestId('assistant-summarize').click();
  const answer = panel.getByTestId('assistant-answer').last();
  await expect(answer).toHaveAttribute('data-status', 'done');
  await expect(panel.getByTestId('assistant-question')).toHaveText(['Summarize this page']);
  await expect(panel.getByTestId('assistant-sent-context')).toContainText('Grid Systems');
  await expect(answer.getByTestId('assistant-answer-text')).toContainText('Grids give rhythm');
  const sources = answer.getByTestId('assistant-source');
  await expect(sources).toHaveCount(1);
  await expect(sources.first()).toContainText('Grid Systems');
  await expect(sources.first()).toContainText('Grids give a layout rhythm');

  const request = server.lastAiRequest()!;
  expect(request.body['model']).toBe('claude-opus-5-5');
  expect(request.body['stream']).toBe(true);
  expect(request.body['fallbacks']).toBe('default');
  expect(String(request.headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
  expect(sentText(request.body)).toContain('Grids give a layout rhythm');
  expect(sentText(request.body)).toContain('"citations":{"enabled":true}');
  expect(sentText(request.body)).not.toContain('Footer text');
  expect(sentText(request.body)).not.toContain('Menu link');

  // A citation shows its passage on the page (selected, scrolled to).
  await answer.getByTestId('assistant-cite').first().click();
  await expect
    .poll(() => article.evaluate('String(window.getSelection())'))
    .toContain('Grids give a layout rhythm');

  // A follow-up: the page isn't sent again — Claude still has it from before.
  await panel.getByTestId('assistant-input').fill('Which baseline?');
  await panel.getByTestId('assistant-input').press('Enter');
  await expect(panel.getByTestId('assistant-answer')).toHaveCount(2);
  await expect(panel.getByTestId('assistant-answer').last()).toHaveAttribute('data-status', 'done');
  const followUp = server.lastAiRequest()!.body['messages'] as { role: string }[];
  expect(followUp.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(server.aiRequests()).toHaveLength(2);

  // Keep an answer: it becomes a note with its sources.
  await panel.getByTestId('assistant-save-note').first().click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('Saved to Notes');
  const notes = (await invoke(panel, 'notes:list', { query: 'Summarize this page' })) as {
    notes: { title: string }[];
  };
  expect(notes.notes.map((n) => n.title)).toContain('Summarize this page');

  // Settings → AI: this month's usage and what was sent — described, never the words.
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="ai"]').click();
  await expect(settings.getByTestId('ai-activity-entry')).toHaveCount(2);
  await expect(settings.getByTestId('ai-activity-entry').last()).toContainText(
    'Page “Grid Systems” (127.0.0.1',
  );
  await expect(settings.getByTestId('ai-activity')).not.toContainText('layout rhythm');
});

test('Tasks from a page, Stop, research questions, and AI off', async () => {
  const { app, win } = orbit;
  await addKey(app);
  // A finding to ask about later (saved with Orbit Capture).
  await invoke(win, 'tabs:create', { url: server.url('/research') });
  const site = await pageWith(app, '/research');
  await site.evaluate(`(() => {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('quote'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
  })()`);
  await clickMenu(app, 'capture');
  const bar = await pageWith(app, '/overlay/');
  await bar.getByTestId('capture-save').click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('Saved');

  await invoke(win, 'tabs:create', { url: server.url('/article') });
  await pageWith(app, '/article');
  await clickMenu(app, 'assistant');
  const panel = await pageWith(app, '#/notes/panel/assistant');

  // Tasks from the page: Claude's suggestions wait to be ticked and added.
  await panel.getByTestId('assistant-page-tasks').click();
  const card = panel.getByTestId('assistant-tasks');
  await expect(card.getByTestId('assistant-task-title')).toHaveText([
    'Audit the spacing on the pricing page.',
    'Share the grid spec with the design team.',
  ]);
  await card.getByTestId('assistant-task-check').nth(1).uncheck();
  await card.getByTestId('assistant-tasks-add').click();
  await expect(win.getByTestId('toolbar-toast')).toContainText('Added 1 task');
  await expect(card).toHaveCount(0);

  // Stop: a long answer stops where it is.
  await panel.getByTestId('assistant-input').fill('Tell me everything SLOW');
  await panel.getByTestId('assistant-send').click();
  await expect(panel.getByTestId('assistant-stop')).toBeVisible();
  await panel.getByTestId('assistant-stop').click();
  await expect(panel.getByTestId('assistant-answer').last()).toHaveAttribute(
    'data-status',
    'stopped',
  );

  // Research: pick saved findings; the answer cites the finding.
  await panel.getByTestId('assistant-clear').click();
  await panel.getByTestId('assistant-attach-research').click();
  await panel.getByTestId('assistant-research-option').first().click();
  await expect(panel.getByTestId('assistant-research-chip')).toBeVisible();
  await panel.getByTestId('assistant-input').fill('What did I save about grids?');
  await panel.getByTestId('assistant-input').press('Enter');
  const answer = panel.getByTestId('assistant-answer').last();
  await expect(answer).toHaveAttribute('data-status', 'done');
  await expect(answer.getByTestId('assistant-source')).toContainText('Grids give rhythm');
  expect(sentText(server.lastAiRequest()!.body)).toContain('Grids give rhythm. Use an 8 pt');

  // AI off: the toolbar's ✦ goes, and the assistant says why instead of sending.
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="ai"]').click();
  await settings.getByTestId('ai-enabled').uncheck();
  await expect(win.getByTestId('toolbar-assistant')).toHaveCount(0);
  await clickMenu(app, 'close-tab');
  await panel.getByTestId('assistant-clear').click();
  await expect(panel.getByTestId('assistant-blocked')).toContainText('turned off');
  await expect(panel.getByTestId('assistant-input')).toBeDisabled();
});

test('Orbit AI as a coworker: it looks at today’s tasks, adds one, and says what it did', async () => {
  const { app, win } = orbit;
  await addKey(app);
  await win.getByTestId('toolbar-assistant').click();
  const panel = await pageWith(app, '#/notes/panel/assistant');
  await expect(panel.getByTestId('assistant-work-access')).toBeVisible();
  const today = await panel.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  await invoke(panel, 'work:saveTask', {
    projectId: null,
    title: 'Send the invoice',
    description: '',
    priority: 'medium',
    status: 'todo',
    dueDate: today,
  });

  await panel.getByTestId('assistant-input').fill('COWORKER what do I have today? add a call');
  await panel.getByTestId('assistant-input').press('Enter');
  const answer = panel.getByTestId('assistant-answer').last();
  await expect(answer).toHaveAttribute('data-status', 'done');
  // What it did, in order, then its answer from the real results.
  await expect(answer.getByTestId('assistant-action')).toHaveText([
    /Looked at today’s tasks \(\d+\)/,
    'Added “Call the printer”',
  ]);
  await expect(answer.getByTestId('assistant-answer-text')).toContainText('Send the invoice');
  await expect(answer.getByTestId('assistant-answer-text')).toContainText('Let me check.');

  // Two requests: the question with tools, then the tool results (validated and run here).
  const requests = server.aiRequests();
  expect(requests).toHaveLength(2);
  const tools = (requests[0]!.body['tools'] as { name: string }[]).map((t) => t.name);
  expect(tools).toContain('create_task');
  expect(tools).not.toContain('delete_task');
  const second = requests[1]!.body['messages'] as { role: string }[];
  expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  const work = (await invoke(panel, 'work:get')) as {
    tasks: { title: string; priority: string }[];
  };
  expect(work.tasks.find((t) => t.title === 'Call the printer')?.priority).toBe('high');

  // Off in Settings → AI: no tools are offered, and the panel says so.
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="ai"]').click();
  await settings.getByTestId('ai-work-access').uncheck();
  await clickMenu(app, 'close-tab');
  await panel.getByTestId('assistant-input').fill('anything else?');
  await panel.getByTestId('assistant-input').press('Enter');
  await expect(panel.getByTestId('assistant-answer').last()).toHaveAttribute('data-status', 'done');
  expect(server.lastAiRequest()!.body['tools']).toBeUndefined();
  await expect(panel.getByTestId('assistant-work-access')).toHaveCount(0);
});
