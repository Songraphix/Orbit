import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

async function overlay(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('/overlay/'))).toBe(true);
  return app.windows().find((p) => p.url().includes('/overlay/'))!;
}

test('the profile menu customises, creates and switches profiles, and links to Settings', async () => {
  const orbit = await launchOrbit();
  try {
    const { app, win } = orbit;
    const avatar = win.getByTestId('toolbar-profile');
    await expect(avatar).toHaveAttribute('aria-label', 'Profile: Personal');
    await avatar.click();
    const bar = await overlay(app);
    const menu = bar.getByTestId('profile-menu');
    await expect(menu).toBeVisible();
    await expect(bar.getByTestId('profile-name')).toHaveText('Personal');

    // Customise: your name (for the greeting), an avatar, a colour.
    await bar.getByTestId('profile-customise').click();
    await bar.getByTestId('profile-field-display-name').fill('Joseph');
    await bar.getByTestId('profile-field-display-name').press('Enter');
    await bar.getByTestId('profile-avatar').nth(4).click(); // 🚀
    await bar.getByTestId('profile-color').nth(2).click();
    await expect(bar.getByTestId('profile-avatar').nth(4)).toHaveAttribute('aria-pressed', 'true');
    await bar.getByTestId('profile-back').click();
    await expect(menu).toContainText('Hi, Joseph');
    await expect(avatar).toContainText('🚀');

    // A new profile gets its own space, and the window switches to it.
    await bar.getByTestId('profile-new').click();
    await bar.getByTestId('profile-new-name').fill('Work');
    await bar.getByTestId('profile-new-create').click();
    await expect(menu).toHaveCount(0);
    await expect(avatar).toHaveAttribute('aria-label', 'Profile: Work');
    await expect(win.getByTestId('space-name')).toHaveText('Work');

    // Back to Personal from the list.
    await avatar.click();
    await expect(bar.getByTestId('profile-item')).toHaveCount(2);
    await bar.getByTestId('profile-item').filter({ hasText: 'Personal' }).click();
    await expect(avatar).toHaveAttribute('aria-label', 'Profile: Personal');

    // Esc closes; the Settings link opens Settings on Profiles.
    await avatar.click();
    await expect(menu).toBeVisible();
    await bar.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await avatar.click();
    await bar.locator('[data-testid="profile-link"][data-page="profiles"]').click();
    await expect
      .poll(() => app.windows().some((p) => p.url().includes('#/settings/profiles')))
      .toBe(true);
  } finally {
    await orbit.close();
  }
});
