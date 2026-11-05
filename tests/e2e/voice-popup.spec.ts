import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import { closeSettings } from './settings-window';
import { startTestServer } from './test-server';
import type { TestServer } from './test-server';

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
/** Presses Shift+Space in the page whose address contains `fragment` (as a real key press). */
const shiftSpace = (app: ElectronApplication, fragment: string) =>
  app.evaluate(({ webContents }, f) => {
    const c = webContents.getAllWebContents().find((w) => w.getURL().includes(f))!;
    c.focus();
    c.sendInputEvent({ type: 'keyDown', keyCode: 'Space', modifiers: ['shift'] });
    c.sendInputEvent({ type: 'char', keyCode: ' ', modifiers: ['shift'] });
    c.sendInputEvent({ type: 'keyUp', keyCode: 'Space', modifiers: ['shift'] });
  }, fragment);

function spokenWav(dir: string, words: string, pauseMs = 700, voice?: string): string {
  const file = join(dir, 'speech.wav');
  execFileSync('say', [
    ...(voice ? ['-v', voice] : []),
    '-o',
    file,
    '--file-format=WAVE',
    '--data-format=LEI16@16000',
    `[[slnc ${pauseMs}]] ${words}`,
  ]);
  return file;
}

async function withVoice(
  words: string,
  run: (o: { app: ElectronApplication; win: Page; server: TestServer }) => Promise<void>,
  pauseMs?: number,
  voice?: string,
) {
  const server = await startTestServer();
  const dir = mkdtempSync(join(tmpdir(), 'orbit-voicepop-'));
  const orbit = await launchOrbit({
    env: {
      ORBIT_MODELS_DIR: join(dir, 'models'),
      ORBIT_TEST_FAKE_MIC: spokenWav(dir, words, pauseMs, voice),
      ORBIT_VOICE_MODEL_BASE: server.url('/hf'),
      ORBIT_ANTHROPIC_BASE_URL: server.url(''),
      ORBIT_TEST_PLAIN_KEYS: '1',
    },
  });
  try {
    await clickMenu(orbit.app, 'settings');
    const settings = await pageWith(orbit.app, '#/settings');
    await invoke(settings, 'ai:setKey', { key: 'sk-ant-test-0123456789abcdefghijklmnop' });
    await closeSettings(orbit.app);
    await run({ app: orbit.app, win: orbit.win, server });
  } finally {
    await orbit.close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Shift+Space opens the voice popup on a page, but types a space in a text box', async () => {
  const server = await startTestServer();
  const { app, win, close } = await launchOrbit({
    env: { ORBIT_MODELS_DIR: '/nonexistent-orbit-models' },
  });
  try {
    // In the Homepage's search box (focused): a space, no popup.
    const home = await pageWith(app, '#/newtab');
    await home.getByTestId('newtab-search').fill('hello');
    await shiftSpace(app, '#/newtab');
    await expect(home.getByTestId('newtab-search')).toHaveValue('hello ');
    const overlay = await pageWith(app, '/overlay/');
    await expect(overlay.getByTestId('voice-popup')).toHaveCount(0);

    // On a web page (nothing to type into): the popup — here offering the speech model first.
    await invoke(win, 'tabs:create', { url: server.url('/one') });
    await expect(win.getByTestId('toolbar-address')).toContainText('Page One');
    await shiftSpace(app, '/one');
    await expect(overlay.getByTestId('voice-popup')).toBeVisible();
    await expect(overlay.getByTestId('voice-popup-download')).toBeVisible();
    await overlay.keyboard.press('Escape');
    await expect(overlay.getByTestId('voice-popup')).toHaveCount(0);
  } finally {
    await close();
    await server.close();
  }
});

test('the voice popup listens, shows what you said and Orbit AI’s answer, read aloud; Open in Panel continues', async () => {
  test.setTimeout(240_000);
  await withVoice('What is on my list today?', async ({ app, win }) => {
    await clickMenu(app, 'voice'); // ⇧⌘Space
    const overlay = await pageWith(app, '/overlay/');
    const popup = overlay.getByTestId('voice-popup');
    await overlay.getByTestId('voice-popup-download').click();
    // Downloads, then listens (the orb follows the microphone), then answers.
    await expect(popup).toHaveAttribute('data-state', /listening|thinking|speaking|idle/, {
      timeout: 120_000,
    });
    await expect(overlay.getByTestId('voice-popup-heard')).toContainText(/list today/i, {
      timeout: 90_000,
    });
    await expect(overlay.getByTestId('voice-popup-answer')).toContainText('You asked:');
    // Read aloud (silently in tests), then Open in Panel shows the same conversation.
    await expect(popup).toHaveAttribute('data-state', /speaking|idle/);
    await overlay.getByTestId('voice-popup-panel').click();
    await expect(popup).toHaveCount(0);
    const panel = await pageWith(app, '#/notes/panel/assistant');
    await expect(panel.getByTestId('assistant-answer').last()).toContainText('You asked:');

    // The panel's own microphone asks there.
    await panel.getByTestId('assistant-mic').click();
    await expect
      .poll(async () => (await panel.getByTestId('assistant-answer').count()) >= 2, {
        timeout: 60_000,
      })
      .toBe(true);
    expect(win).toBeTruthy();
  });
});

test('“Hey Orbit” (opt-in): heard on this Mac, the popup answers what came after it', async () => {
  test.setTimeout(240_000);
  await withVoice(
    'Hey Orbit, what is on my list today?',
    async ({ app, win }) => {
      // The model first (once), through the popup.
      await clickMenu(app, 'voice');
      const overlay = await pageWith(app, '/overlay/');
      await overlay.getByTestId('voice-popup-download').click();
      await expect
        .poll(async () => (await invoke<{ modelReady: boolean }>(win, 'voice:get')).modelReady, {
          timeout: 120_000,
        })
        .toBe(true);
      // (Not this time: the recording is for "Hey Orbit" — it starts after a long pause.)
      await overlay.getByTestId('voice-popup-close').click();
      await expect(overlay.getByTestId('voice-popup')).toHaveCount(0);

      // Turn it on in Settings → Voice: the toolbar shows it's listening.
      await clickMenu(app, 'settings');
      const settings = await pageWith(app, '#/settings');
      await settings.locator('[data-testid="settings-nav"][data-section="voice"]').click();
      await settings.getByTestId('voice-wake-word').click();
      await expect(settings.getByTestId('voice-wake-word')).toBeChecked();
      await closeSettings(app);
      await expect(win.getByTestId('toolbar-wake')).toBeVisible({ timeout: 30_000 });

      // "Hey Orbit, …": the popup opens with the request and Orbit AI's answer.
      await expect(overlay.getByTestId('voice-popup')).toBeVisible({ timeout: 60_000 });
      await expect(overlay.getByTestId('voice-popup-heard')).toContainText(/list today/i);
      await expect(overlay.getByTestId('voice-popup-answer')).toContainText('You asked:');
      await overlay.getByTestId('voice-popup-close').click();

      // The toolbar's microphone turns it off.
      await win.getByTestId('toolbar-wake').click();
      await expect(win.getByTestId('toolbar-wake')).toHaveCount(0);
    },
    20_000,
    'Daniel', // a clear voice for the phrase
  );
});
