import { contextBridge } from 'electron';
import type { OrbitInternalApi } from '@shared/types/orbit-api';

// Internal orbit:// pages get their own, smaller API (PLAN.md section 4.2). Empty until Phase 4.
const api: OrbitInternalApi = {};

contextBridge.exposeInMainWorld('orbit', api);
