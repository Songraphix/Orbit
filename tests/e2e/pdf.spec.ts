import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  await expect
    .poll(() => app.windows().some((p) => p.url().includes(fragment)), { timeout: 15_000 })
    .toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
type Tab = { id: string; url: string; title: string; pdf: boolean };
const activeTab = async (win: Page) => {
  const s = await invoke<{ tabs: Tab[]; activeTabId: string }>(win, 'tabs:get');
  return s.tabs.find((t) => t.id === s.activeTabId)!;
};
/** Right-clicks the PDF (as if `selection` were selected) and picks `label` from Orbit's menu. */
const pickFromPageMenu = (app: ElectronApplication, selection: string, label: string) =>
  app.evaluate(
    ({ Menu, webContents }, [text, item]) => {
      const pdf = webContents.getAllWebContents().find((c) => /two-pages\.pdf$/.test(c.getURL()))!;
      const original = Menu.prototype.popup;
      Menu.prototype.popup = function popup() {
        Menu.prototype.popup = original;
        const found = this.items.find((i) => i.label === item);
        if (!found) throw new Error(`No “${item}” in ${this.items.map((i) => i.label).join(', ')}`);
        found.click();
      };
      pdf.emit(
        'context-menu',
        { preventDefault() {} },
        {
          x: 10,
          y: 10,
          linkURL: '',
          linkText: '',
          srcURL: '',
          mediaType: 'none',
          selectionText: text,
          isEditable: false,
          misspelledWord: '',
          dictionarySuggestions: [],
          frameURL: pdf.getURL(),
          pageURL: pdf.getURL(),
          altText: '',
          editFlags: {
            canUndo: false,
            canRedo: false,
            canCut: false,
            canCopy: true,
            canPaste: false,
            canSelectAll: true,
          },
        },
      );
    },
    [selection, label] as const,
  );

test('PDFs: open one from this Mac (scoped address), read it for Orbit AI, and keep notes on it beside it', async () => {
  test.setTimeout(120_000);
  const server = await startTestServer();
  const dir = mkdtempSync(join(tmpdir(), 'orbit-pdf-'));
  const file = join(dir, 'two-pages.pdf');
  copyFileSync(join(import.meta.dirname, '../fixtures/two-pages.pdf'), file);
  const env = { ORBIT_ANTHROPIC_BASE_URL: server.url(''), ORBIT_TEST_PLAIN_KEYS: '1' };
  const first = await launchOrbit({ env });
  const { userData } = first;
  try {
    const { app, win } = first;
    // From Finder / the Dock: Orbit opens it in a tab at an orbit-pdf:// address.
    await app.evaluate(
      ({ app: a }, path) => a.emit('open-file', { preventDefault() {} }, path),
      file,
    );
    await expect
      .poll(async () => (await activeTab(win)).url)
      .toMatch(/^orbit-pdf:\/\/file\/[0-9a-f-]{36}\/two-pages\.pdf$/);
    await expect.poll(async () => (await activeTab(win)).pdf).toBe(true);
    // A web page can't reach it by guessing: only the token's own file is served.
    const denied = await win.evaluate(async () => {
      try {
        return (await fetch('orbit-pdf://file/00000000-0000-0000-0000-000000000000/x.pdf')).status;
      } catch {
        return 'blocked';
      }
    });
    expect([404, 'blocked']).toContain(denied);

    // PDF Notes: one Orbit note for this PDF, beside it; selections are added to it.
    await pickFromPageMenu(app, 'teal and sand', 'Add to PDF Notes');
    await pickFromPageMenu(app, 'launch checklist', 'Add to PDF Notes');
    const panel = await pageWith(app, '#/notes/panel');
    const { notes } = await invoke<{ notes: { id: string; title: string; preview: string }[] }>(
      panel,
      'notes:list',
      { query: 'teal' },
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toBe('Notes · two-pages.pdf');
    // The note's document has both quotes, after the line saying which PDF it's about.
    const note = await invoke<{ doc: string }>(panel, 'notes:get', { id: notes[0]!.id });
    expect(note.doc).toContain('teal and sand');
    expect(note.doc).toContain('launch checklist');
    expect(note.doc).toContain('on this Mac');
    expect(note.doc.indexOf('teal and sand')).toBeLessThan(note.doc.indexOf('launch checklist'));

    // Orbit AI reads the PDF's text (PDF.js) when asked — here with "Ask Orbit About This PDF".
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await invoke(settings, 'ai:setKey', { key: 'sk-ant-test-0123456789abcdefghijklmnop' });
    await closeSettings(app);
    await pickFromPageMenu(app, '', 'Ask Orbit About This PDF');
    const assistant = await pageWith(app, '#/notes/panel/assistant');
    await assistant.getByTestId('assistant-input').fill('What colours?');
    await assistant.getByTestId('assistant-input').press('Enter');
    await expect(assistant.getByTestId('assistant-answer').last())
      .toHaveAttribute('data-status', 'done')
      .catch(async (e) => {
        console.log('ANSWER', await assistant.getByTestId('assistant').innerText());
        throw e;
      });
    const sent = JSON.stringify(server.lastAiRequest()!.body['messages']);
    expect(sent).toContain('brand colours: teal and sand');
    expect(sent).toContain('Second page');
  } finally {
    await first.close({ keepData: true });
  }

  // After a restart the PDF tab still opens (its address is remembered); a web PDF works too.
  const second = await launchOrbit({ userData, env });
  try {
    const { win } = second;
    const tabs = await invoke<{ tabs: Tab[] }>(win, 'tabs:get');
    const local = tabs.tabs.find((t) => t.url.startsWith('orbit-pdf://'))!;
    await invoke(win, 'tabs:activate', { tabId: local.id });
    await expect.poll(async () => (await activeTab(win)).pdf).toBe(true);
    await invoke(win, 'tabs:create', { url: server.url('/two-pages.pdf') });
    await expect.poll(async () => (await activeTab(win)).pdf).toBe(true);
  } finally {
    await second.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
