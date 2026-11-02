import { app, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';
import type { SettingsRepository } from '../../persistence/repositories/settings';
import type { AiKeyStore } from '../../ai/key-store';
import { backupFileName, BackupError } from '../../backup/archive';
import { NeedsPassphrase } from '../../backup/service';
import type { BackupService } from '../../backup/service';

/**
 * Settings → Backup (roadmap P4.7). Every call comes from the Settings page; files are only
 * ever written where you choose in a dialog.
 */
export function registerBackupHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: {
    backups: BackupService;
    settings: SettingsRepository;
    passphrase: AiKeyStore;
    /** The last automatic backup's error, if it failed. */
    lastError: () => string | null;
    /** Runs an automatic backup now (after choosing a folder). */
    runAuto: (force: boolean) => Promise<void>;
  },
): void {
  const settingsWindow = (webContentsId: number) => {
    const owner = windows.tabForContents(webContentsId);
    if (!owner || !owner.tab.state.url.startsWith('orbit://settings')) {
      throw new Error(`Sender ${webContentsId} is not orbit://settings`);
    }
    return owner.window;
  };
  /** The backup chosen for restoring, kept while its passphrase is asked for. */
  let restoreFile: string | null = null;

  router.handle('backup:status', (_input, { sender }) => {
    settingsWindow(sender.webContentsId);
    return {
      auto: deps.settings.get('backup.auto'),
      last: deps.settings.get('backup.last'),
      encrypted: deps.passphrase.has(),
      canStore: deps.passphrase.canStore,
      error: deps.lastError(),
      restorePending: existsSync(join(app.getPath('userData'), 'restore-pending')),
    };
  });

  router.handle('backup:now', async (_input, { sender }) => {
    const window = settingsWindow(sender.webContentsId);
    const { canceled, filePath } = await dialog.showSaveDialog(window.win, {
      title: 'Back Up Orbit',
      defaultPath: join(app.getPath('documents'), backupFileName(Date.now())),
      filters: [{ name: 'Orbit Backup', extensions: ['orbitbackup'] }],
    });
    if (canceled || !filePath) return { file: null, bytes: 0 };
    const bytes = await deps.backups.backupTo(filePath);
    deps.settings.set('backup.last', Date.now());
    return { file: filePath, bytes };
  });

  router.handle('backup:auto', async ({ action, keep }, { sender }) => {
    const window = settingsWindow(sender.webContentsId);
    const current = deps.settings.get('backup.auto');
    if (action === 'off') {
      deps.settings.set('backup.auto', null);
      return;
    }
    if (action === 'keep') {
      if (current && keep) deps.settings.set('backup.auto', { ...current, keep });
      return;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(window.win, {
      title: 'Choose a Folder for Backups',
      buttonLabel: 'Back Up Here',
      properties: ['openDirectory', 'createDirectory'],
    });
    const folder = filePaths[0];
    if (canceled || !folder) return;
    deps.settings.set('backup.auto', { folder, keep: current?.keep ?? 10 });
    await deps.runAuto(true); // the first one now
  });

  router.handle('backup:passphrase', ({ passphrase }, { sender }) => {
    settingsWindow(sender.webContentsId);
    if (passphrase === null) {
      deps.passphrase.clear();
      return { ok: true, error: null };
    }
    if (passphrase.length < 8) return { ok: false, error: 'Use at least 8 characters' };
    try {
      deps.passphrase.set(passphrase);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true, error: null };
  });

  router.handle('backup:restore', async ({ passphrase }, { sender }) => {
    const window = settingsWindow(sender.webContentsId);
    if (passphrase === undefined || !restoreFile) {
      const { canceled, filePaths } = await dialog.showOpenDialog(window.win, {
        title: 'Restore from Backup',
        properties: ['openFile'],
        filters: [{ name: 'Orbit Backup', extensions: ['orbitbackup'] }],
      });
      if (canceled || !filePaths[0]) return { status: 'cancelled' as const, message: null };
      restoreFile = filePaths[0];
    }
    try {
      const { createdAt } = await deps.backups.prepareRestore(restoreFile, passphrase);
      restoreFile = null;
      const { response } = await dialog.showMessageBox(window.win, {
        type: 'question',
        message: `Restore the backup from ${new Date(createdAt).toLocaleString()}?`,
        detail:
          'Orbit restarts to finish. Everything you have now is replaced by the backup — and kept in a “before-restore” folder in Orbit’s data, in case you need it.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        app.relaunch();
        app.quit();
      }
      return {
        status: 'ready' as const,
        message: 'Orbit finishes restoring the next time it starts.',
      };
    } catch (error) {
      if (error instanceof NeedsPassphrase)
        return { status: 'passphrase' as const, message: error.message };
      restoreFile = null;
      const message =
        error instanceof BackupError || error instanceof Error ? error.message : String(error);
      return { status: 'error' as const, message };
    }
  });

  router.handle('backup:cancelRestore', (_input, { sender }) => {
    settingsWindow(sender.webContentsId);
    restoreFile = null;
    deps.backups.cancelRestore();
  });
}
