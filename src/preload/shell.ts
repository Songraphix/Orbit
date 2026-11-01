import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { OrbitApi } from '@shared/types/orbit-api';

// Type-only import of the contract keeps zod out of the preload bundle. Main is the real
// gatekeeper (unknown channels have no handler; payloads are validated there); this pattern
// check just stops renderers reaching arbitrary Electron-internal channels.
const CHANNEL = /^[a-z]+:[a-z][a-zA-Z]*$/;

function assertChannel(channel: string): void {
  if (!CHANNEL.test(channel)) throw new Error(`Invalid IPC channel: ${channel}`);
}

const api: OrbitApi = {
  async invoke(channel, input) {
    assertChannel(channel); // async: a bad name rejects the promise like any other IPC error
    return ipcRenderer.invoke(channel, input);
  },
  on(channel, listener) {
    assertChannel(channel);
    const wrapped = (_event: IpcRendererEvent, payload: unknown) =>
      listener(payload as Parameters<typeof listener>[0]);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('orbit', api);
