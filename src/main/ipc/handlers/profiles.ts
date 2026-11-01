import type { IpcRouter } from '../router';
import { profileView } from '../../sidebar/profiles';
import type { WindowController, WindowManager } from '../../windows/window-manager';

/** Goes to a space of this profile — the first in the bar — or makes it one. */
export function switchToProfile(controller: WindowController, profileId: string): void {
  const { store, tabs } = controller;
  const profile = store.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  const existing = store.spaces.find((s) => s.profileId === profileId);
  const space = existing ?? store.createSpace({ name: profile.name, icon: 'planet', profileId });
  tabs.switchSpace(space.id);
  // A brand-new space starts on a new tab page, like a new window.
  if (!existing) tabs.create();
}

/**
 * The profile menu (owner request, like Wavebox's): who you are in this space, your other
 * profiles, a new one, and the way to Settings. Opened from the toolbar's avatar.
 */
export function registerProfileHandlers(
  router: IpcRouter,
  windows: WindowManager,
  deps: { runCommand: (controller: WindowController, id: string) => void },
): void {
  const windowFor = (webContentsId: number) => {
    const controller = windows.forSender(webContentsId);
    if (!controller) throw new Error(`Sender ${webContentsId} has no window`);
    return controller;
  };

  router.handle('profile:menu', ({ anchor }, { sender }) => {
    windowFor(sender.webContentsId).overlay.toggleProfileMenu(anchor);
  });

  router.handle('profile:get', (_input, { sender }) => {
    const { store, tabs } = windowFor(sender.webContentsId);
    const current = store.profiles.find((p) => p.id === tabs.space.profileId) ?? store.profiles[0]!;
    return {
      current: profileView(current),
      profiles: store.profiles.map((p) => ({
        ...profileView(p),
        spaces: store.spaces.filter((s) => s.profileId === p.id).length,
      })),
    };
  });

  router.handle('profile:update', ({ id, patch }, { sender }) => {
    // The overlay's menu, or Settings (an internal page in a tab).
    const controller =
      windows.forSender(sender.webContentsId) ??
      windows.tabForContents(sender.webContentsId)?.window;
    if (!controller) throw new Error(`Sender ${sender.webContentsId} has no window`);
    controller.store.updateProfile(id, patch);
  });

  router.handle('profile:switch', ({ id }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    controller.overlay.closeProfileMenu();
    switchToProfile(controller, id);
  });

  router.handle('profile:create', ({ name }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    const clean = name.trim();
    if (!clean) return;
    const profile = controller.store.createProfile(clean);
    controller.overlay.closeProfileMenu();
    switchToProfile(controller, profile.id);
  });

  router.handle('profile:open', ({ page }, { sender }) => {
    const controller = windowFor(sender.webContentsId);
    controller.overlay.closeProfileMenu();
    if (page === 'library') controller.library.open('media');
    else if (page === 'import') deps.runCommand(controller, 'import-arc');
    else
      controller.tabs.create(page === 'settings' ? 'orbit://settings' : `orbit://settings/${page}`);
  });
}
