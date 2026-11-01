import { useEffect, useState } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { CommandBar } from './CommandBar';

/**
 * Transparent top-most layer for floating UI (ADR-006). Main shows this view only while
 * something is open, sized to the whole window.
 */
export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({ commandBar: null });

  useEffect(() => {
    const unsubscribe = window.orbit.on('state:overlay', setState);
    void window.orbit.invoke('overlay:get', {}).then(setState);
    return unsubscribe;
  }, []);

  if (!state.commandBar) return null;
  return <CommandBar key={state.commandBar.openedAt} {...state.commandBar} />;
}
