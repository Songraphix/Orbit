import { describe, expect, it, vi } from 'vitest';
import { IpcRouter } from '../../src/main/ipc/router';
import type { IpcMainLike, InvokeEventLike } from '../../src/main/ipc/router';
import { SenderRegistry } from '../../src/main/ipc/sender';

const ORIGIN = 'http://localhost:5173/';
const INFO = { name: 'Orbit', version: '0.0.1', electron: '45', chrome: '156', platform: 'darwin' };

type Listener = (event: InvokeEventLike, payload: unknown) => unknown;

function setup() {
  const listeners = new Map<string, Listener>();
  const ipcMain: IpcMainLike = { handle: (channel, l) => void listeners.set(channel, l) };
  const senders = new SenderRegistry([ORIGIN]);
  senders.add(1, 'shell');
  senders.add(2, 'internal');
  const router = new IpcRouter(ipcMain, senders);
  const call = (channel: string, payload: unknown, event: Partial<InvokeEventLike> = {}) => {
    const listener = listeners.get(channel);
    if (!listener) throw new Error(`No handler registered for '${channel}'`);
    return listener(
      {
        sender: { id: 1 },
        senderFrame: { url: `${ORIGIN}shell/index.html`, parent: null },
        ...event,
      },
      payload,
    );
  };
  return { router, call };
}

describe('IpcRouter', () => {
  it('runs the handler for a valid call from a trusted sender', async () => {
    const { router, call } = setup();
    const handler = vi.fn(() => INFO);
    router.handle('app:getInfo', handler);

    await expect(call('app:getInfo', {})).resolves.toEqual(INFO);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects payloads that fail the schema without running the handler', async () => {
    const { router, call } = setup();
    const handler = vi.fn(() => INFO);
    router.handle('app:getInfo', handler);

    await expect(call('app:getInfo', { extra: true })).rejects.toThrow('invalid_payload');
    await expect(call('app:getInfo', 'nope')).rejects.toThrow('invalid_payload');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects untrusted webContents, iframes and foreign origins', async () => {
    const { router, call } = setup();
    const handler = vi.fn(() => INFO);
    router.handle('app:getInfo', handler);
    const url = `${ORIGIN}shell/index.html`;

    await expect(call('app:getInfo', {}, { sender: { id: 99 } })).rejects.toThrow(
      'untrusted_sender',
    );
    await expect(call('app:getInfo', {}, { senderFrame: { url, parent: {} } })).rejects.toThrow(
      'untrusted_sender',
    );
    await expect(
      call('app:getInfo', {}, { senderFrame: { url: 'https://evil.example/', parent: null } }),
    ).rejects.toThrow('untrusted_sender');
    await expect(call('app:getInfo', {}, { senderFrame: null })).rejects.toThrow(
      'untrusted_sender',
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a trusted surface calling a channel not meant for it', async () => {
    const { router, call } = setup();
    const handler = vi.fn(() => INFO);
    router.handle('app:getInfo', handler); // default surfaces: shell + overlay

    // webContents 2 is an internal page (e.g. the new tab page) — trusted, but not the shell.
    await expect(call('app:getInfo', {}, { sender: { id: 2 } })).rejects.toThrow(
      'untrusted_sender',
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects handler output that does not match the contract', async () => {
    const { router, call } = setup();
    router.handle('app:getInfo', () => ({ ...INFO, version: 1 }) as unknown as typeof INFO);

    await expect(call('app:getInfo', {})).rejects.toThrow('invalid_output');
  });

  it('refuses duplicate registration and reports missing handlers', () => {
    const { router } = setup();
    expect(() => router.assertComplete()).toThrow('app:getInfo');
    router.handle('app:getInfo', () => INFO);
    expect(() => router.handle('app:getInfo', () => INFO)).toThrow('already registered');
    // Other channels are still missing, but app:getInfo is no longer listed.
    expect(() => router.assertComplete()).toThrow(/^(?!.*app:getInfo).*without handlers/);
  });
});

describe('SenderRegistry', () => {
  it('stops trusting a webContents once removed', () => {
    const senders = new SenderRegistry([ORIGIN]);
    const info = { webContentsId: 7, frameUrl: `${ORIGIN}shell/index.html`, isMainFrame: true };
    senders.add(7, 'shell');
    expect(senders.surfaceOf(info)).toBe('shell');
    senders.remove(7);
    expect(senders.isTrusted(info)).toBe(false);
  });

  it('does not treat a lookalike origin as trusted', () => {
    const senders = new SenderRegistry(['http://localhost:5173/']);
    senders.add(1, 'shell');
    expect(
      senders.isTrusted({
        webContentsId: 1,
        frameUrl: 'http://localhost:5173.evil.example/',
        isMainFrame: true,
      }),
    ).toBe(false);
  });
});
