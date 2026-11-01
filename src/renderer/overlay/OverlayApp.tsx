import { useEffect, useState } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { CommandBar } from './CommandBar';
import { PromptView } from './PromptView';

/**
 * Transparent top-most layer for floating UI (ADR-006). Main shows this view only while
 * something is open, sized to the whole window.
 */
export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({ commandBar: null, prompt: null });

  useEffect(() => {
    const unsubscribe = window.orbit.on('state:overlay', setState);
    void window.orbit.invoke('overlay:get', {}).then(setState);
    return unsubscribe;
  }, []);

  // A site's question takes precedence; the command bar comes back once it's answered.
  if (state.prompt) return <PromptView key={state.prompt.id} prompt={state.prompt} />;
  if (!state.commandBar) return null;
  return <CommandBar key={state.commandBar.openedAt} {...state.commandBar} />;
}
