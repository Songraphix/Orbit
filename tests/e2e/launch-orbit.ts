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

/** Launches the built app with a throwaway profile, so tests never touch real data. */
export async function launchOrbit(options: { userData?: string } = {}): Promise<Orbit> {
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), 'orbit-e2e-'));
  // Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would start
  // Electron as plain Node with no window. Strip it for the app under test.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  const app = await electron.launch({
    args: ['.'],
    env: { ...(env as Record<string, string>), ORBIT_USER_DATA_DIR: userData },
  });
  const win = await app.firstWindow();
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
