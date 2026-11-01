import type { z } from 'zod';
import { events } from '@shared/ipc/contract';
import type { EventChannel, EventPayload } from '@shared/ipc/contract';

/** The subset of WebContents the broadcaster needs. */
export type EventTarget = {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
};

/** Pushes main → renderer events (state snapshots) to every registered Orbit surface. */
export class Broadcaster {
  private readonly targets = new Set<EventTarget>();

  add(target: EventTarget): void {
    this.targets.add(target);
  }

  remove(target: EventTarget): void {
    this.targets.delete(target);
  }

  /** Sends to every registered surface. */
  send<E extends EventChannel>(channel: E, payload: EventPayload<E>): void {
    const data = validate(channel, payload);
    for (const target of this.targets) {
      if (target.isDestroyed()) this.targets.delete(target);
      else target.send(channel, data);
    }
  }

  /** Sends to one surface (e.g. a single window's shell). */
  sendTo<E extends EventChannel>(target: EventTarget, channel: E, payload: EventPayload<E>): void {
    const data = validate(channel, payload);
    if (!target.isDestroyed()) target.send(channel, data);
  }
}

// Validate in main so a bad snapshot fails loudly here, not silently in the UI.
function validate<E extends EventChannel>(channel: E, payload: EventPayload<E>): unknown {
  return (events as Record<EventChannel, z.ZodType>)[channel].parse(payload);
}
