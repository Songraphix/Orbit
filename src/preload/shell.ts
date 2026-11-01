import { contextBridge } from 'electron';
import type { OrbitApi } from '@shared/types/orbit-api';

const api: OrbitApi = {
  platform: process.platform,
  versions: { electron: process.versions.electron ?? '', chrome: process.versions.chrome ?? '' },
};

contextBridge.exposeInMainWorld('orbit', api);
