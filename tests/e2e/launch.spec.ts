import { expect, test } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import type { Orbit } from './launch-orbit';

let orbit: Orbit;

test.beforeAll(async () => {
  orbit = await launchOrbit();
});

test.afterAll(async () => {
  await orbit?.close();
});

test('shows the shell window', async () => {
  const { win } = orbit;
  await expect(win).toHaveTitle('Orbit');
  await expect(win.getByRole('heading', { name: 'Orbit' })).toBeVisible();
  await expect(win.getByTestId('app-info')).toContainText('Electron');
});

test('isolates the shell: no Node, only the window.orbit bridge', async () => {
  const env = await orbit.win.evaluate(() => {
    const g = globalThis as { require?: unknown; process?: unknown; orbit?: unknown };
    return {
      hasRequire: typeof g.require !== 'undefined',
      hasProcess: typeof g.process !== 'undefined',
      hasOrbit: typeof g.orbit === 'object',
    };
  });
  expect(env).toEqual({ hasRequire: false, hasProcess: false, hasOrbit: true });
});

test('IPC: valid calls succeed; bad payloads and unknown channels are rejected', async () => {
  const result = await orbit.win.evaluate(async () => {
    type Invoke = (channel: string, input: unknown) => Promise<unknown>;
    const { invoke } = (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit;
    const outcome = (p: Promise<unknown>) =>
      p.then(
        (v) => ({ ok: true, v }),
        (e: Error) => ({ ok: false, v: e.message }),
      );
    return {
      info: await outcome(invoke('app:getInfo', {})),
      badPayload: await outcome(invoke('app:getInfo', { extra: 1 })),
      unknown: await outcome(invoke('tabs:nope', {})),
      badName: await outcome(invoke('ELECTRON_BROWSER_REQUIRE', {})),
    };
  });

  expect(result.info).toMatchObject({ ok: true, v: { name: 'Orbit' } });
  expect(result.badPayload.ok).toBe(false);
  expect(String(result.badPayload.v)).toContain('invalid_payload');
  expect(result.unknown.ok).toBe(false);
  expect(result.badName.ok).toBe(false);
  expect(String(result.badName.v)).toContain('Invalid IPC channel');
});
