import { app } from 'electron';
import type { IpcRouter } from '../router';

export function registerAppHandlers(router: IpcRouter): void {
  router.handle('app:getInfo', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    platform: process.platform,
  }));
}
