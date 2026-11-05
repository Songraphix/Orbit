import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
const overlayOf = (app: ElectronApplication) => pageWith(app, '/overlay/');

/** A spoken sentence as a 16 kHz WAV (macOS's own voice), with a short pause before it. */
function spokenWav(dir: string, words: string): string {
  const file = join(dir, 'speech.wav');
  execFileSync('say', [
    '-o',
    file,
    '--file-format=WAVE',
    '--data-format=LEI16@16000',
    `[[slnc 700]] ${words}`,
  ]);
  return file;
}

test('voice without the speech model: the command bar offers the one-time download; Esc steps back', async () => {
  const models = mkdtempSync(join(tmpdir(), 'orbit-models-'));
  const { app, win, close } = await launchOrbit({ env: { ORBIT_MODELS_DIR: models } });
  try {
    // The command bar's microphone (⇧⌘Space now opens the voice popup).
    await clickMenu(app, 'new-tab');
    const overlay = await overlayOf(app);
    await expect(overlay.getByTestId('command-bar')).toBeVisible();
    await overlay.getByTestId('voice-button').click();
    const status = overlay.getByTestId('voice-status');
    await expect(status).toHaveAttribute('data-phase', 'needs-model');
    await expect(status).toContainText('80 MB');
    await expect(status).toContainText('never leaves');
    // Esc dismisses the offer first; the bar stays; Esc again closes it.
    await overlay.getByTestId('command-input').press('Escape');
    await expect(status).toHaveCount(0);
    await expect(overlay.getByTestId('command-bar')).toBeVisible();
    await overlay.getByTestId('command-input').press('Escape');
    await expect(overlay.getByTestId('command-bar')).toHaveCount(0);
    // Settings → Voice says it isn't downloaded.
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await settings.locator('[data-testid="settings-nav"][data-section="voice"]').click();
    await expect(settings.getByTestId('voice-model-missing')).toBeVisible();
    await closeSettings(app);
    expect(win).toBeTruthy();
  } finally {
    await close();
    rmSync(models, { recursive: true, force: true });
  }
});

test('voice end to end: download the model, speak, the words land in the command bar; Orbit AI answers and reads it aloud', async () => {
  test.setTimeout(300_000);
  const server = await startTestServer();
  const dir = mkdtempSync(join(tmpdir(), 'orbit-voice-'));
  const wav = spokenWav(dir, 'What is on my list today?');
  const models = join(dir, 'models');
  const { app, win, close } = await launchOrbit({
    env: {
      ORBIT_MODELS_DIR: models,
      ORBIT_TEST_FAKE_MIC: wav,
      ORBIT_VOICE_MODEL_BASE: server.url('/hf'),
      ORBIT_ANTHROPIC_BASE_URL: server.url(''),
      ORBIT_TEST_PLAIN_KEYS: '1',
    },
  });
  const consoleLines: string[] = [];
  app.on('window', (page) =>
    page.on('console', (m) => consoleLines.push(`${page.url().slice(-30)} ${m.text()}`)),
  );
  for (const page of app.windows()) page.on('console', (m) => consoleLines.push(m.text()));
  try {
    // Orbit AI on (a key), so spoken questions are offered to it.
    await clickMenu(app, 'settings');
    const settings = await pageWith(app, '#/settings');
    await invoke(settings, 'ai:setKey', { key: 'sk-ant-test-0123456789abcdefghijklmnop' });
    await closeSettings(app);

    await win.evaluate(() => {
      const w = globalThis as unknown as {
        orbit: { on: (c: string, l: (p: unknown) => void) => void };
        voiceLog: unknown[];
      };
      w.voiceLog = [];
      w.orbit.on('state:voice', (p) => w.voiceLog.push(p));
    });
    await clickMenu(app, 'new-tab');
    const overlay = await overlayOf(app);
    await overlay.getByTestId('voice-button').click();
    const status = overlay.getByTestId('voice-status');
    await expect(status).toHaveAttribute('data-phase', 'needs-model');
    await overlay.getByTestId('voice-download').click();
    // Downloads (checked file by file), then listens straight away.
    await expect(status).toHaveAttribute('data-phase', /downloading|loading|listening/);
    await expect(overlay.getByTestId('voice-button')).toHaveAttribute('data-phase', 'listening', {
      timeout: 180_000,
    });
    // The recording plays, then silence: listening ends by itself and Whisper writes it down.
    const input = overlay.getByTestId('command-input');
    await expect(input)
      .toHaveValue(/list today/i, { timeout: 60_000 })
      .catch(async (e) => {
        const log = await win.evaluate(() =>
          (
            globalThis as unknown as {
              voiceLog: { phase: string; error: string | null; transcript: unknown }[];
            }
          ).voiceLog
            .filter(
              (v, i, a) =>
                i === 0 || v.phase !== a[i - 1]!.phase || v.transcript !== a[i - 1]!.transcript,
            )
            .map((v) => `${v.phase} ${v.error ?? ''} ${JSON.stringify(v.transcript)}`),
        );
        console.log(log.join('\n'));
        console.log(
          consoleLines
            .filter((l) => /voice|error|Error/i.test(l))
            .slice(-20)
            .join('\n'),
        );
        throw e;
      });
    await expect(input).toHaveAttribute('data-spoken', 'true');
    await expect(status).toHaveCount(0);
    // A question: Orbit AI is the first result.
    const first = overlay.getByTestId('command-item').first();
    await expect(first).toHaveAttribute('data-kind', 'ask');
    await input.press('Enter');

    // The answer, in the panel — read aloud (silently in tests) because it was spoken.
    const panel = await pageWith(app, '#/notes/panel/assistant');
    const answer = panel.getByTestId('assistant-answer').last();
    await expect(answer).toHaveAttribute('data-status', 'done');
    await expect(answer.getByTestId('assistant-speak')).toHaveAttribute('data-speaking', 'true');
    await answer.getByTestId('assistant-speak').click(); // Stop Reading
    await expect(answer.getByTestId('assistant-speak')).toHaveAttribute('data-speaking', 'false');

    // Typed words aren't "spoken"; the microphone is off once listening ends.
    await clickMenu(app, 'new-tab');
    const overlay2 = await overlayOf(app);
    await overlay2.getByTestId('command-input').fill('hello');
    await expect(overlay2.getByTestId('command-input')).toHaveAttribute('data-spoken', 'false');
    const voice = await invoke<{ phase: string; modelReady: boolean }>(win, 'voice:get');
    expect(voice).toMatchObject({ phase: 'idle', modelReady: true });
  } finally {
    await close();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
