import { useEffect, useState } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { CommandBar } from './CommandBar';
import { PeekFrame } from './PeekFrame';
import { SiteControls } from './SiteControls';
import { CaptureLayer } from './CaptureLayer';
import { PromptView } from './PromptView';
import { FloatingSidebar } from './FloatingSidebar';

/**
 * Transparent top-most layer for floating UI (ADR-006). Main shows this view only while
 * something is open, sized to the whole window.
 */
export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    commandBar: null,
    prompt: null,
    peek: null,
    siteControls: null,
    capture: null,
    sidebarPeek: null,
  });

  useEffect(() => {
    const unsubscribe = window.orbit.on('state:overlay', setState);
    void window.orbit.invoke('overlay:get', {}).then(setState);
    return unsubscribe;
  }, []);

  // A site's question takes precedence; the command bar comes back once it's answered.
  // Peek's frame stays underneath either.
  const top = state.prompt ? (
    <PromptView key={state.prompt.id} prompt={state.prompt} />
  ) : state.commandBar ? (
    <CommandBar key={state.commandBar.openedAt} {...state.commandBar} />
  ) : state.capture ? (
    <CaptureLayer key={state.capture.openedAt} area={state.capture.area} />
  ) : state.siteControls ? (
    <SiteControls view={state.siteControls} />
  ) : null;
  // Anything else opening takes over the overlay: the slid-out sidebar goes back in.
  const busy = top !== null || state.peek !== null;
  useEffect(() => {
    if (busy && state.sidebarPeek) void window.orbit.invoke('sidebar:peek', { open: false });
  }, [busy, state.sidebarPeek]);
  return (
    <>
      {state.sidebarPeek && !busy && <FloatingSidebar width={state.sidebarPeek.width} />}
      {state.peek && <PeekFrame peek={state.peek} interactive={top === null} />}
      {top}
    </>
  );
}
