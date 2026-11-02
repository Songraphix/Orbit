import { useEffect, useState } from 'react';
import { Coffee, Crosshair } from 'lucide-react';
import { focusClock, focusRemaining } from '@shared/focus';
import { useMainState } from '../use-main-state';

/**
 * A focus session at a glance in the sidebar (brief M7): what you're on and the time left,
 * when the sidebar is showing (a break, or you brought it back). A click opens Focus.
 */
export function FocusChip() {
  const session = useMainState('state:focus');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);
  if (!session) return null;
  const left = focusRemaining(session, now);
  const brk = session.kind === 'break';
  return (
    <button
      type="button"
      onClick={() => void window.orbit.invoke('focus:open', {})}
      className="press mx-2 mb-1 flex h-9 items-center gap-2 rounded-[11px] bg-[var(--tile-bg)] px-2.5 text-left text-[12.5px] text-[var(--sidebar-fg)] hover:bg-[var(--hover)]"
      data-testid="sidebar-focus"
    >
      {brk ? (
        <Coffee size={14} className="shrink-0" />
      ) : (
        <Crosshair size={14} className="shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      <span
        className={`shrink-0 tabular-nums ${left < 0 ? 'text-[#ff9f0a]' : 'text-[var(--sidebar-muted)]'}`}
      >
        {session.pausedAt ? 'Paused' : focusClock(left)}
      </span>
    </button>
  );
}
