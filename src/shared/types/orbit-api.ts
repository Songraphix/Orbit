import type {
  Channel,
  EventChannel,
  EventPayload,
  InternalEventChannel,
  InvokeInput,
  InvokeOutput,
} from '../ipc/contract';

/** The API the shell/overlay preload exposes as `window.orbit`. */
export type OrbitApi = {
  /** Send an intent to the main process (PLAN.md section 4.4). */
  invoke<C extends Channel>(channel: C, input: InvokeInput<C>): Promise<InvokeOutput<C>>;
  /** Subscribe to a main → renderer event. Returns an unsubscribe function. */
  on<E extends EventChannel>(channel: E, listener: (payload: EventPayload<E>) => void): () => void;
};

/** The reduced API exposed to internal orbit:// pages: requests (main limits the channels) and a
 *  few events of their own (INTERNAL_EVENTS). */
export type OrbitInternalApi = Pick<OrbitApi, 'invoke'> & {
  on<E extends InternalEventChannel>(
    channel: E,
    listener: (payload: EventPayload<E>) => void,
  ): () => void;
};
