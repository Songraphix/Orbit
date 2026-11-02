import { Minus, Pause, PictureInPicture, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PopoutAction, PopoutView } from '@shared/types/media';

const act = (action: PopoutAction) => void window.orbit.invoke('popout:action', { action });

/**
 * The video pop-out's buttons (owner request, like Arc), over the video in its small rounded
 * window: Close and Minimize on the left, Back to Video on the right, play/pause in the middle.
 * They show while the pointer is over the window (or the video is paused); drag anywhere else
 * to move it.
 */
export function PopoutControls() {
  const [view, setView] = useState<PopoutView | null>(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    let live = true;
    void window.orbit.invoke('popout:get', {}).then((v) => live && v && setView(v));
    const off = window.orbit.on('popout:update', setView);
    return () => {
      live = false;
      off();
    };
  }, []);

  const shown = view ? view.hover || !view.playing : false;
  return (
    <div
      className="fixed inset-0 overflow-hidden select-none [-webkit-app-region:drag]"
      data-testid="popout-controls"
      data-shown={shown}
    >
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent" />

        <div className="absolute top-2.5 left-2.5 flex gap-1.5 [-webkit-app-region:no-drag]">
          <Round label="Close" onClick={() => act('close')} testId="popout-close">
            <X size={14} strokeWidth={2.25} />
          </Round>
          <Round
            label="Minimize to Sidebar"
            onClick={() => act('minimize')}
            testId="popout-minimize"
          >
            <Minus size={14} strokeWidth={2.25} />
          </Round>
        </div>
        <div className="absolute top-2.5 right-2.5 [-webkit-app-region:no-drag]">
          <Round label="Back to Video" onClick={() => act('back')} testId="popout-back">
            <PictureInPicture size={14} strokeWidth={2} />
          </Round>
        </div>

        <button
          type="button"
          aria-label={view?.playing ? 'Pause' : 'Play'}
          title={view?.playing ? 'Pause' : 'Play'}
          onClick={() => act('toggle')}
          className="press absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-[0_0_0_0.5px_rgb(255_255_255/0.2)] backdrop-blur-md hover:bg-black/65 [-webkit-app-region:no-drag]"
          data-testid="popout-toggle"
        >
          {view?.playing ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>

        {view?.title && (
          <p className="pointer-events-none absolute right-3 bottom-2.5 left-3 truncate text-[12px] font-medium text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
            {view.title}
          </p>
        )}
      </div>
    </div>
  );
}

function Round(props: { label: string; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="press grid size-7 place-items-center rounded-full bg-black/45 text-white shadow-[0_0_0_0.5px_rgb(255_255_255/0.2)] backdrop-blur-md hover:bg-black/70"
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
