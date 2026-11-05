import { lazy, Suspense, useEffect, useState } from 'react';
import type { OverlayState } from '@shared/types/command-bar';
import { CommandBar } from './CommandBar';
import { ShotCard } from './ShotCard';
import { GroupingCard } from './GroupingCard';
import { AppLibrary } from './AppLibrary';
import { VoicePopup } from './VoicePopup';
import { PeekFrame } from './PeekFrame';
import { SiteControls } from './SiteControls';
import { CaptureLayer } from './CaptureLayer';
import { ColorPickLayer } from './ColorPickLayer';
import { PromptView } from './PromptView';
import { FloatingSidebar } from './FloatingSidebar';
import { CreateMenu } from './CreateMenu';
import { ProfileMenu } from './ProfileMenu';
import { OrbitMenu } from './OrbitMenu';
import { CaptureCard } from './CaptureCard';
import { TooltipPill } from '../tooltip/TooltipPill';
import { DownloadFlight } from './DownloadFlight';
import { BackdropContext } from './backdrop';

// The note editor (Tiptap) loads the first time a quick note opens.
const QuickNote = lazy(() => import('./QuickNote').then((m) => ({ default: m.QuickNote })));

/**
 * Transparent top-most layer for floating UI (ADR-006). Main shows this view only while
 * something is open, sized to the whole window.
 */
export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    commandBar: null,
    prompt: null,
    peek: null,
    origin: { x: 0, y: 0 },
    siteControls: null,
    capture: null,
    colorPick: null,
    sidebarPeek: null,
    createMenu: null,
    quickNote: null,
    profileMenu: null,
    orbitMenu: null,
    captureCard: null,
    shot: null,
    tooltip: null,
    flight: null,
    backdrop: null,
    grouping: null,
    appLibrary: null,
    voicePopup: null,
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
  ) : state.voicePopup ? (
    <VoicePopup key={state.voicePopup.at} popup={state.voicePopup} />
  ) : state.commandBar ? (
    <CommandBar key={state.commandBar.openedAt} {...state.commandBar} />
  ) : state.capture ? (
    <CaptureLayer key={state.capture.openedAt} area={state.capture.area} />
  ) : state.colorPick ? (
    <ColorPickLayer
      key={state.colorPick.openedAt}
      area={state.colorPick.area}
      image={state.colorPick.image}
    />
  ) : state.siteControls ? (
    <SiteControls view={state.siteControls} />
  ) : state.createMenu ? (
    <CreateMenu key={state.createMenu.openedAt} anchor={state.createMenu.anchor} />
  ) : state.orbitMenu ? (
    <OrbitMenu key={state.orbitMenu.openedAt} anchor={state.orbitMenu.anchor} />
  ) : state.profileMenu ? (
    <ProfileMenu key={state.profileMenu.openedAt} anchor={state.profileMenu.anchor} />
  ) : state.shot ? (
    <ShotCard key={state.shot.at} shot={state.shot} />
  ) : state.grouping ? (
    <GroupingCard key={state.grouping.at} grouping={state.grouping} />
  ) : state.appLibrary ? (
    <AppLibrary key={state.appLibrary.at} library={state.appLibrary} />
  ) : state.captureCard ? (
    <CaptureCard key={state.captureCard.openedAt} />
  ) : state.quickNote ? (
    <Suspense fallback={null}>
      <QuickNote key={state.quickNote.id} id={state.quickNote.id} />
    </Suspense>
  ) : null;
  // Anything else opening takes over the overlay: the slid-out sidebar goes back in. (A Peek
  // steps aside for the slid-out sidebar instead, so its tab can be left for another.)
  const busy = top !== null;
  useEffect(() => {
    if (busy && state.sidebarPeek) void window.orbit.invoke('sidebar:peek', { open: false });
  }, [busy, state.sidebarPeek]);
  return (
    <BackdropContext.Provider value={state.backdrop}>
      {state.sidebarPeek && !busy && <FloatingSidebar width={state.sidebarPeek.width} />}
      {state.peek && (
        <PeekFrame peek={state.peek} origin={state.origin} interactive={top === null} />
      )}
      {top}
      {state.flight && <DownloadFlight key={state.flight.at} flight={state.flight} />}
      {state.tooltip && (
        // Alone, the overlay is just the tooltip's box; otherwise it sits at its place.
        <div
          className={`pointer-events-none fixed z-[100] flex items-center ${
            state.tooltip.side === 'right' ? 'justify-start' : 'justify-center'
          }`}
          style={{
            left: state.tooltip.alone ? 0 : state.tooltip.box.x,
            top: state.tooltip.alone ? 0 : state.tooltip.box.y,
            width: state.tooltip.box.width,
            height: state.tooltip.box.height,
          }}
        >
          <TooltipPill
            key={state.tooltip.at}
            label={state.tooltip.label}
            keys={state.tooltip.keys}
            side={state.tooltip.side}
          />
        </div>
      )}
    </BackdropContext.Provider>
  );
}
