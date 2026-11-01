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

  send<E extends EventChannel>(channel: E, payload: EventPayload<E>): void {
    // Validate in main so a bad snapshot fails loudly here, not silently in the UI.
    const schema = (events as Record<EventChannel, z.ZodType>)[channel];
    const data = schema.parse(payload);
    for (const target of this.targets) {
      if (target.isDestroyed()) this.targets.delete(target);
      else target.send(channel, data);
    }
  }
}
