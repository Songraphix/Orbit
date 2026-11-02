import { expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

/** Closes Orbit's Settings window (it has its own window, not a tab). */
export async function closeSettings(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('#/settings'))
      ?.close();
  });
  await expect
    .poll(() => app.windows().some((p) => !p.isClosed() && p.url().includes('#/settings')))
    .toBe(false);
}
