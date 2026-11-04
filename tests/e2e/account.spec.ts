import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

/**
 * Settings → Account against the Firebase Emulator (npm run test:e2e:cloud starts it). Without
 * an emulator running this is skipped — a normal run never talks to Firebase.
 */
const HOST = '127.0.0.1';
const PROJECT = 'demo-orbit';

async function emulatorUp(): Promise<boolean> {
  try {
    return (await fetch(`http://${HOST}:9099/`)).status < 500;
  } catch {
    return false;
  }
}

const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function settingsPage(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'settings');
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/settings'))).toBe(true);
  const page = app.windows().find((p) => p.url().includes('#/settings'))!;
  await page.getByTestId('settings-page').waitFor();
  return page;
}

/** The emulator keeps the emails it would send: open the verification link. */
async function verify(email: string): Promise<void> {
  const list = (await (
    await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/oobCodes`)
  ).json()) as { oobCodes: { email: string; oobCode: string; requestType: string }[] };
  const code = list.oobCodes
    .filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL')
    .at(-1)!;
  await fetch(
    `http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=emulator-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oobCode: code.oobCode }),
    },
  );
}

test('Settings → Account: create an account, verify, sync, sign out, sign in', async () => {
  test.skip(!(await emulatorUp()), 'needs the Firebase Emulator (npm run test:e2e:cloud)');
  const orbit = await launchOrbit({
    env: {
      ORBIT_FIREBASE_EMULATOR: HOST,
      ORBIT_FIREBASE_PROJECT: PROJECT,
      ORBIT_TEST_PLAIN_KEYS: '1',
    },
  });
  try {
    const page = await settingsPage(orbit.app);
    await expect(page.getByTestId('account-form')).toBeVisible();
    await expect(page.getByTestId('account-google')).toBeDisabled(); // no desktop client here

    // Create an account: sync waits for the emailed link.
    const email = `e2e-${Date.now()}@example.com`;
    await page.locator('[data-testid="account-mode"] [data-value="signUp"]').click();
    await page.getByTestId('account-email').fill(email);
    await page.getByTestId('account-password').fill('a good password');
    await page.getByTestId('account-submit').click();
    await expect(page.getByTestId('account-sign-out')).toBeVisible();
    await expect(page.getByTestId('account-sync-state')).toHaveAttribute(
      'data-state',
      'verify-email',
    );
    await expect(page.getByTestId('account-notice')).toContainText('sent a link');

    // Open the link → sync starts, and everything on this Mac goes up.
    await verify(email);
    await page.getByTestId('account-check-verified').click();
    await expect(page.getByTestId('account-verify')).toHaveCount(0);
    await expect(page.getByTestId('account-sync-state')).toHaveAttribute('data-state', 'synced', {
      timeout: 15_000,
    });

    // Sign out: back to the form, everything stays here.
    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('account-form')).toBeVisible();
    await expect(page.getByTestId('account-notice')).toContainText('stays on this Mac');

    // A wrong password says so plainly; the right one signs back in.
    await page.getByTestId('account-email').fill(email);
    await page.getByTestId('account-password').fill('wrong password');
    await page.getByTestId('account-submit').click();
    await expect(page.getByTestId('account-error')).toContainText('don’t match an account');
    await page.getByTestId('account-password').fill('a good password');
    await page.getByTestId('account-submit').click();
    await expect(page.getByTestId('account-sync-state')).toHaveAttribute('data-state', 'synced', {
      timeout: 15_000,
    });
  } finally {
    await orbit.close();
  }
});
