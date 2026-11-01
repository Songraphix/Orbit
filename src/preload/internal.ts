import { contextBridge } from 'electron';
import type { OrbitInternalApi } from '@shared/types/orbit-api';

const api: OrbitInternalApi = { platform: process.platform };

contextBridge.exposeInMainWorld('orbit', api);
