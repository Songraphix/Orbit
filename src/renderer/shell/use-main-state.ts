import { useEffect, useState } from 'react';
import type { EventPayload } from '@shared/ipc/contract';

/** Each state slice: the event that streams it and the channel that fetches it initially. */
const GETTERS = {
  'state:layout': 'layout:get',
  'state:tabs': 'tabs:get',
} as const;
type StateEvent = keyof typeof GETTERS;

/**
 * Mirrors one slice of main-process state (ADR-004): fetches it once, then follows live
 * snapshots. A snapshot that arrives before the initial fetch wins, since it's newer.
 */
export function useMainState<E extends StateEvent>(event: E): EventPayload<E> | null {
  const [state, setState] = useState<EventPayload<E> | null>(null);

  useEffect(() => {
    let live = true;
    const unsubscribe = window.orbit.on(event, (payload) => setState(payload));
    // Every getter takes an empty object; widening to the union lets TypeScript see that.
    const getter: (typeof GETTERS)[StateEvent] = GETTERS[event];
    void window.orbit.invoke(getter, {}).then((initial) => {
      if (live) setState((current) => current ?? (initial as EventPayload<E>));
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [event]);

  return state;
}
