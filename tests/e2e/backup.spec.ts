import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchOrbit } from './launch-orbit';

type Invoke = (channel: string, input: unknown) => Promise<unknown>;
const invoke = (page: Page, channel: string, input: unknown = {}) =>
  page.evaluate(
    ([c, i]) => (globalThis as unknown as { orbit: { invoke: Invoke } }).orbit.invoke(c, i),
    [channel, input] as const,
  );
const clickMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(
    ({ Menu }, menuId) => Menu.getApplicationMenu()!.getMenuItemById(menuId)!.click(),
    id,
  );
async function pageWith(app: ElectronApplication, fragment: string): Promise<Page> {
  await expect.poll(() => app.windows().some((p) => p.url().includes(fragment))).toBe(true);
  return app.windows().find((p) => p.url().includes(fragment))!;
}
/** Dialogs answer for the user: save/open at `path`, and "Later" to restarting. */
const answerDialogs = (app: ElectronApplication, path: string) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never;
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as never;
  }, path);
async function backupSettings(app: ElectronApplication): Promise<Page> {
  await clickMenu(app, 'settings');
  const settings = await pageWith(app, '#/settings');
  await settings.locator('[data-testid="settings-nav"][data-section="backup"]').click();
  return settings;
}
const projectNames = async (panel: Page) => {
  const data = (await invoke(panel, 'work:get')) as { projects: { name: string }[] };
  return data.projects.map((p) => p.name);
};

test('back up, change things, restore: the backup comes back at the next start (roadmap P4.7)', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'orbit-backups-'));
  const first = await launchOrbit({ env: { ORBIT_TEST_PLAIN_KEYS: '1' } });
  const { userData } = first;
  try {
    const { app, win } = first;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel/projects');
    await expect(panel.getByTestId('project-card')).toHaveCount(4); // the samples

    // Back Up Now.
    const plain = join(folder, 'plain.orbitbackup');
    const settings = await backupSettings(app);
    await expect(settings.getByTestId('backup-privacy')).toContainText('never uploads');
    await answerDialogs(app, plain);
    await settings.getByTestId('backup-now').click();
    await expect(settings.getByTestId('backup-message')).toContainText('plain.orbitbackup');
    expect(existsSync(plain)).toBe(true);

    // An encrypted backup asks for its passphrase when it's restored without it.
    await settings.getByTestId('backup-passphrase').fill('correct horse');
    await settings.getByTestId('backup-passphrase').press('Enter');
    await expect(settings.getByTestId('backup-passphrase-remove')).toBeVisible();
    const locked = join(folder, 'locked.orbitbackup');
    await answerDialogs(app, locked);
    await settings.getByTestId('backup-now').click();
    await expect(settings.getByTestId('backup-message')).toContainText('locked.orbitbackup');
    await settings.getByTestId('backup-passphrase-remove').click();
    await settings.getByTestId('backup-restore').click();
    await expect(settings.getByTestId('backup-message')).toContainText('encrypted');
    await settings.getByTestId('backup-restore-passphrase').fill('correct horse');
    await settings.getByTestId('backup-restore-passphrase').press('Enter');
    await expect(settings.getByTestId('backup-message')).toContainText('next time it starts');
    await settings.getByTestId('backup-cancel-restore').click(); // changed my mind
    await expect(settings.getByTestId('backup-restore')).toBeVisible();

    // A new project after the backup…
    await clickMenu(app, 'close-tab');
    await panel.getByTestId('new-project').click();
    await panel.getByTestId('project-name').fill('After the Backup');
    await panel.getByTestId('form-save').click();
    await expect(panel.getByTestId('project-card')).toHaveCount(5);

    // …then the plain backup is restored (at the next start).
    const again = await backupSettings(app);
    await answerDialogs(app, plain);
    await again.getByTestId('backup-restore').click();
    await expect(again.getByTestId('backup-message')).toContainText('next time it starts');
  } finally {
    await first.close({ keepData: true });
  }

  const second = await launchOrbit({ userData, env: { ORBIT_TEST_PLAIN_KEYS: '1' } });
  try {
    const { app, win } = second;
    await invoke(win, 'notes:panel', { view: 'projects' });
    const panel = await pageWith(app, '#/notes/panel');
    await expect.poll(() => projectNames(panel)).toHaveLength(4);
    expect(await projectNames(panel)).not.toContain('After the Backup');
    expect(existsSync(join(userData, 'before-restore'))).toBe(true);
  } finally {
    await second.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
