import { Check, Crosshair, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { focusClock, focusRemaining } from '@shared/focus';
import type { FocusSession } from '@shared/focus';
import { Tip } from '../tooltip/Tip';

/** Ticks once a second while a session is showing. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Focus mode in the toolbar (roadmap P2.3): what you're on and the time left — orange once
 * you're over. ✓ ticks the task off and ends the session; ■ just ends it. The name opens the
 * project in the panel.
 */
export function FocusPill({ session }: { session: FocusSession }) {
  const now = useNow(true);
  const left = focusRemaining(session, now);
  const over = left < 0;
  return (
    <div
      className="no-drag animate-pop flex h-7 max-w-[300px] min-w-0 items-center gap-1 rounded-full bg-[#5b5bd6]/[0.1] pr-0.5 pl-2 text-[12.5px] font-semibold text-[#3f3fb0] ring-1 ring-[#5b5bd6]/20"
      data-testid="focus-pill"
    >
      <Crosshair
        size={13}
        className={`shrink-0 ${over ? '' : 'animate-[orbit-focus-pulse_2.4s_ease-in-out_infinite]'}`}
      />
      <button
        type="button"
        onClick={() =>
          void window.orbit.invoke(
            'notes:panel',
            session.projectId ? { projectId: session.projectId } : { view: 'tasks' },
          )
        }
        className="min-w-0 truncate hover:underline"
        data-testid="focus-title"
      >
        {session.title}
      </button>
      <span
        className={`shrink-0 px-1 tabular-nums ${over ? 'text-[#e8590c]' : 'opacity-80'}`}
        data-testid="focus-clock"
      >
        {focusClock(left)}
      </span>
      {session.taskId && (
        <Tip label="Done — Tick It Off">
          <button
            type="button"
            aria-label="Done"
            onClick={() => void window.orbit.invoke('focus:end', { complete: true })}
            className="press grid size-6 shrink-0 place-items-center rounded-full bg-[#5b5bd6] text-on-accent hover:brightness-110"
            data-testid="focus-done"
          >
            <Check size={13} strokeWidth={3} />
          </button>
        </Tip>
      )}
      <Tip label="End Focus">
        <button
          type="button"
          aria-label="End focus"
          onClick={() => void window.orbit.invoke('focus:end', { complete: false })}
          className="press grid size-6 shrink-0 place-items-center rounded-full hover:bg-[#5b5bd6]/15"
          data-testid="focus-end"
        >
          <Square size={10} fill="currentColor" />
        </button>
      </Tip>
    </div>
  );
}
