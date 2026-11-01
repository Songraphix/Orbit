import type { z } from 'zod';
import { contract } from '@shared/ipc/contract';
import type { Channel, Contract, InvokeOutput } from '@shared/ipc/contract';
import type { SenderInfo, SenderRegistry } from './sender';

/** The subset of Electron's ipcMain the router uses (lets tests pass a fake). */
export type IpcMainLike = {
  handle(channel: string, listener: (event: InvokeEventLike, payload: unknown) => unknown): void;
};

/** The subset of IpcMainInvokeEvent the router reads. */
export type InvokeEventLike = {
  sender: { id: number };
  senderFrame: { url: string; parent: unknown } | null;
};

export type HandlerContext = { sender: SenderInfo };

export type Handler<C extends Channel> = (
  input: z.output<Contract[C]['input']>,
  ctx: HandlerContext,
) => InvokeOutput<C> | Promise<InvokeOutput<C>>;

export class IpcError extends Error {
  constructor(
    readonly code: 'untrusted_sender' | 'invalid_payload' | 'invalid_output',
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'IpcError';
  }
}

export function toSenderInfo(event: InvokeEventLike): SenderInfo {
  return {
    webContentsId: event.sender.id,
    frameUrl: event.senderFrame?.url ?? null,
    isMainFrame: event.senderFrame !== null && event.senderFrame.parent === null,
  };
}

/**
 * Registers handlers for channels in the shared contract. Every call is checked:
 * sender must be trusted, input must match the zod schema, and output is validated
 * so a buggy handler can't leak unexpected data to a renderer.
 */
export class IpcRouter {
  private readonly registered = new Set<Channel>();

  constructor(
    private readonly ipcMain: IpcMainLike,
    private readonly senders: SenderRegistry,
  ) {}

  handle<C extends Channel>(channel: C, handler: Handler<C>): void {
    if (this.registered.has(channel)) throw new Error(`Handler already registered: ${channel}`);
    this.registered.add(channel);
    const spec = contract[channel];

    this.ipcMain.handle(channel, async (event, payload) => {
      const sender = toSenderInfo(event);
      if (!this.senders.isTrusted(sender)) {
        throw new IpcError('untrusted_sender', `${channel} from ${sender.frameUrl ?? 'unknown'}`);
      }
      const input = spec.input.safeParse(payload);
      if (!input.success) {
        throw new IpcError('invalid_payload', `${channel}: ${input.error.message}`);
      }
      const result = await handler(input.data as z.output<Contract[C]['input']>, { sender });
      const output = spec.output.safeParse(result);
      if (!output.success) {
        throw new IpcError('invalid_output', `${channel}: ${output.error.message}`);
      }
      return output.data;
    });
  }

  /** Call after wiring: fails fast if a contract channel has no handler. */
  assertComplete(): void {
    const missing = (Object.keys(contract) as Channel[]).filter((c) => !this.registered.has(c));
    if (missing.length > 0) throw new Error(`IPC channels without handlers: ${missing.join(', ')}`);
  }
}
