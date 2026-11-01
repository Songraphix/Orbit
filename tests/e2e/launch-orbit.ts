import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

export type Orbit = {
  app: ElectronApplication;
  win: Page;
  /** The throwaway profile directory this instance uses. */
  userData: string;
  /** Quits the app; deletes the profile unless `keepData` (to relaunch on the same profile). */
  close: (options?: { keepData?: boolean }) => Promise<void>;
};

/**
 * The main window's shell page. Tab views are pages too (the new tab page can appear first),
 * so pick the shell by its URL rather than taking the first page.
 */
async function shellPage(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const shell = app.windows().find((p) => p.url().includes('/shell/index.html'));
    if (shell) return shell;
    await app.waitForEvent('window', { timeout: 250 }).catch(() => undefined);
  }
  throw new Error('Orbit shell window did not appear');
}

/** Launches the built app with a throwaway profile, so tests never touch real data. */
export async function launchOrbit(options: { userData?: string } = {}): Promise<Orbit> {
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), 'orbit-e2e-'));
  // Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would start
  // Electron as plain Node with no window. Strip it for the app under test.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...(env as Record<string, string>),
      ORBIT_USER_DATA_DIR: userData,
      // Command bar results stay deterministic (no live Google suggestions).
      ORBIT_DISABLE_SUGGESTIONS: '1',
      // Downloads land inside the throwaway profile, never in ~/Downloads.
      ORBIT_DOWNLOADS_DIR: join(userData, 'Downloads'),
    },
  });
  const win = await shellPage(app);
  // Wait until the shell has rendered (and subscribed to main's events), like a real user would.
  await win.getByTestId('toolbar').waitFor({ timeout: 15_000 });
  return {
    app,
    win,
    userData,
    close: async ({ keepData = false } = {}) => {
      await app.close();
      if (!keepData) rmSync(userData, { recursive: true, force: true });
    },
  };
}
