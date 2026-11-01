import { _electron as electron, expect, test } from '@playwright/test';

test('launches and shows the shell window', async () => {
  // Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would start
  // Electron as plain Node with no window. Strip it for the app under test.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  const app = await electron.launch({ args: ['.'], env: env as Record<string, string> });
  try {
    const win = await app.firstWindow();
    await expect(win).toHaveTitle('Orbit');
    await expect(win.getByRole('heading', { name: 'Orbit' })).toBeVisible();

    // Shell must be isolated: no Node in the page, only the window.orbit bridge.
    const env = await win.evaluate(() => {
      const g = globalThis as { require?: unknown; orbit?: unknown };
      return {
        hasRequire: typeof g.require !== 'undefined',
        hasOrbit: typeof g.orbit === 'object',
      };
    });
    expect(env).toEqual({ hasRequire: false, hasOrbit: true });
  } finally {
    await app.close();
  }
});
