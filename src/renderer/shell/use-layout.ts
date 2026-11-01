import { useEffect, useState } from 'react';
import type { Layout } from '@shared/types/layout';

/** Mirrors this window's layout from main (ADR-004): initial fetch, then live updates. */
export function useLayout(): Layout | null {
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    let live = true;
    const unsubscribe = window.orbit.on('state:layout', setLayout);
    void window.orbit.invoke('layout:get', {}).then((initial) => {
      if (live) setLayout((current) => current ?? initial);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return layout;
}
