import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';
import type { Orbit } from './launch-orbit';

let orbit: Orbit;
test.beforeEach(async () => {
  orbit = await launchOrbit();
});
test.afterEach(async () => {
  await orbit?.close();
});

const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function settingsPage(app: ElectronApplication): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes('#/settings'))).toBe(true);
  return app.windows().find((p) => p.url().includes('#/settings'))!;
}

test('Settings → Profiles: add, rename, give a space its own profile, delete when unused', async () => {
  const { app } = orbit;
  await clickMenu(app, 'settings');
  const settings = await settingsPage(app);
  await settings.locator('[data-testid="settings-nav"][data-section="profiles"]').click();

  const rows = settings.getByTestId('profile-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Default');

  // Add "Work", then rename it.
  await settings.getByTestId('profile-new-name').fill('Work');
  await settings.getByTestId('profile-add').click();
  await expect(rows).toHaveCount(2);
  const name = rows.nth(1).getByTestId('profile-name');
  await expect(name).toHaveValue('Work');
  await name.fill('Office');
  await name.press('Enter');
  await expect(rows.nth(1).getByTestId('profile-name')).toHaveValue('Office');

  // The space moves to Office: Office can't be deleted while it's in use.
  const select = settings.getByTestId('space-profile').first();
  await select.selectOption({ label: 'Office' });
  await expect(rows.nth(1)).toContainText('1 space');
  await expect(rows.nth(1).getByTestId('profile-delete')).toBeDisabled();
  await expect(rows.first().getByTestId('profile-delete')).toBeDisabled(); // the default, always

  // Back to the default profile; now Office can go (the confirmation is answered "Delete").
  await select.selectOption({ index: 0 });
  await expect(rows.nth(1)).toContainText('No spaces');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  });
  await rows.nth(1).getByTestId('profile-delete').click();
  await expect(rows).toHaveCount(1);
});

test('Settings has sections in a sidebar: About shows the versions', async () => {
  const { app } = orbit;
  await clickMenu(app, 'settings');
  const settings = await settingsPage(app);
  await expect(settings.getByTestId('settings-nav')).toHaveText([
    'General',
    'Profiles',
    'Workspaces',
    'Integrations',
    'Shortcuts',
    'AI',
    'Privacy',
    'About',
  ]);
  await settings.locator('[data-testid="settings-nav"][data-section="about"]').click();
  await expect(settings.getByTestId('about-versions')).toContainText('Chromium');
});
