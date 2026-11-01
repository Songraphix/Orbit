import { contextBridge, ipcRenderer } from 'electron';
import type { OrbitInternalApi } from '@shared/types/orbit-api';

// Internal orbit:// pages (the new tab page, later Library/Settings) get a smaller API than the
// shell (PLAN.md section 4.2): requests only, no event stream. Main additionally checks that each
// channel allows the 'internal' surface, so this page can't drive tabs or the sidebar.
const CHANNEL = /^[a-z]+:[a-z][a-zA-Z]*$/;

const api: OrbitInternalApi = {
  async invoke(channel, input) {
    if (!CHANNEL.test(channel)) throw new Error(`Invalid IPC channel: ${channel}`);
    return ipcRenderer.invoke(channel, input);
  },
};

contextBridge.exposeInMainWorld('orbit', api);
