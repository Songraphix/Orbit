import { Check, Coffee, Crosshair, Pause, Play, Square } from 'lucide-react';
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
 * you're over, green on a break. Pause stops the clock; ✓ ticks the task off and ends the
 * session; ■ just ends it. The name opens the panel's Focus view.
 */
export function FocusPill({ session }: { session: FocusSession }) {
  const now = useNow(true);
  const left = focusRemaining(session, now);
  const over = left < 0;
  const paused = session.pausedAt !== null;
  const brk = session.kind === 'break';
  return (
    <div
      className={`no-drag animate-pop flex h-7 max-w-[300px] min-w-0 items-center gap-1 rounded-full pr-0.5 pl-2 text-[12.5px] font-semibold ring-1 ${
        brk
          ? 'bg-[#34c759]/[0.12] text-[#1f7a37] ring-[#34c759]/25 dark:text-[#7ee29a]'
          : 'bg-[var(--accent-fill)]/[0.1] text-[var(--accent-fill)] ring-[var(--accent-fill)]/20 dark:bg-[var(--accent-fill)]/25 dark:text-[var(--orbit-sea-glass)]'
      }`}
      data-testid="focus-pill"
      data-kind={session.kind}
    >
      {brk ? (
        <Coffee size={13} className="shrink-0" />
      ) : (
        <Crosshair
          size={13}
          className={`shrink-0 ${over || paused ? '' : 'animate-[orbit-focus-pulse_2.4s_ease-in-out_infinite]'}`}
        />
      )}
      <button
        type="button"
        onClick={() => void window.orbit.invoke('focus:open', {})}
        className="min-w-0 truncate hover:underline"
        data-testid="focus-title"
      >
        {session.title}
      </button>
      <span
        className={`shrink-0 px-1 tabular-nums ${over ? 'text-[#e8590c]' : 'opacity-80'} ${paused ? 'animate-pulse' : ''}`}
        data-testid="focus-clock"
      >
        {focusClock(left)}
      </span>
      {!over && (
        <Tip label={paused ? 'Resume' : 'Pause'}>
          <button
            type="button"
            aria-label={paused ? 'Resume' : 'Pause'}
            onClick={() => void window.orbit.invoke('focus:pause', { paused: !paused })}
            className="press grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--accent-fill)]/15"
            data-testid="focus-pill-pause"
          >
            {paused ? (
              <Play size={11} fill="currentColor" />
            ) : (
              <Pause size={11} fill="currentColor" />
            )}
          </button>
        </Tip>
      )}
      {session.taskId && !brk && (
        <Tip label="Done — Tick It Off">
          <button
            type="button"
            aria-label="Done"
            onClick={() => void window.orbit.invoke('focus:end', { complete: true })}
            className="press grid size-6 shrink-0 place-items-center rounded-full bg-[var(--accent-fill)] text-on-accent hover:brightness-110"
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
          className="press grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--accent-fill)]/15"
          data-testid="focus-end"
        >
          <Square size={10} fill="currentColor" />
        </button>
      </Tip>
    </div>
  );
}
