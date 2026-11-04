import { dialog } from 'electron';
import type { IpcRouter } from '../router';
import type { WindowManager } from '../../windows/window-manager';
import type { AccountService } from '../../cloud/account';

/**
 * Orbit accounts (docs/FIREBASE.md): Settings → Account signs in and out and shows sync; the
 * profile menu (overlay) may read the state. Nothing here ever returns a token.
 */
export function registerAccountHandlers(
  router: IpcRouter,
  windows: WindowManager,
  accounts: AccountService,
): void {
  const settingsOnly = (webContentsId: number) => {
    const window = windows.settingsFor(webContentsId);
    if (!window) throw new Error(`Sender ${webContentsId} is not Settings`);
    return window;
  };

  router.handle('account:get', (_input, { sender }) => {
    if (!windows.settingsFor(sender.webContentsId) && !windows.forSender(sender.webContentsId)) {
      throw new Error(`Sender ${sender.webContentsId} has no window`);
    }
    return accounts.view();
  });
  router.handle('account:signIn', ({ email, password }, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.signIn(email, password);
  });
  router.handle('account:signUp', ({ email, password }, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.signUp(email, password);
  });
  router.handle('account:google', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.signInWithGoogle();
  });
  router.handle('account:cancelGoogle', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    accounts.cancelGoogle();
  });
  router.handle('account:resetPassword', ({ email }, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.sendPasswordReset(email);
  });
  router.handle('account:resendVerification', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.resendVerification();
  });
  router.handle('account:checkVerification', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.refreshVerification();
  });
  router.handle('account:signOut', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.signOut();
  });
  router.handle('account:syncNow', async (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    await accounts.syncNow();
    return accounts.view();
  });
  router.handle('account:dismiss', (_input, { sender }) => {
    settingsOnly(sender.webContentsId);
    return accounts.clearNotice();
  });
  router.handle('account:delete', async ({ password }, { sender }) => {
    const window = settingsOnly(sender.webContentsId);
    const email = accounts.view().user?.email ?? 'your account';
    const { response } = await dialog.showMessageBox(window.win, {
      type: 'warning',
      message: `Delete ${email}?`,
      detail:
        'Your account and everything Orbit keeps for it in the cloud — projects, tasks, notes, Easels, Spaces, pinned tabs and favourites — are deleted for good. This Mac keeps its own copy.',
      buttons: ['Cancel', 'Delete Account'],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return accounts.view();
    return accounts.deleteAccount(password);
  });
}
