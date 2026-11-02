import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { OrbitInternalApi } from '@shared/types/orbit-api';

// Internal orbit:// pages (the new tab page, Library, Settings, the productivity panel) get a
// smaller API than the shell (PLAN.md section 4.2): requests, and only their own few events.
// Main additionally checks that each channel allows the 'internal' surface, so these pages can't
// drive tabs or the sidebar.
const CHANNEL = /^[a-z]+:[a-z][a-zA-Z]*$/;
/** Keep in step with INTERNAL_EVENTS in the contract (a unit test checks). */
const EVENTS = new Set(['assistant:update', 'toolkit:update', 'focus:update', 'sounds:update']);

const api: OrbitInternalApi = {
  async invoke(channel, input) {
    if (!CHANNEL.test(channel)) throw new Error(`Invalid IPC channel: ${channel}`);
    return ipcRenderer.invoke(channel, input);
  },
  on(channel, listener) {
    if (!EVENTS.has(channel)) throw new Error(`Not an event for this page: ${channel}`);
    const wrapped = (_event: IpcRendererEvent, payload: unknown) =>
      listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('orbit', api);
