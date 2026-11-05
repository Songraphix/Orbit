import { expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

/** Puts Orbit's Settings away (it opens as a sheet over the browser window). */
export async function closeSettings(app: ElectronApplication): Promise<void> {
  const settings = app.windows().find((p) => !p.isClosed() && p.url().includes('#/settings'));
  if (settings) {
    await settings
      .evaluate(() =>
        (
          globalThis as unknown as {
            orbit: { invoke: (c: string, i: unknown) => Promise<unknown> };
          }
        ).orbit.invoke('settings:close', {}),
      )
      .catch(() => undefined); // closing the page can end the call
  }
  await expect
    .poll(() => app.windows().some((p) => !p.isClosed() && p.url().includes('#/settings')))
    .toBe(false);
}
