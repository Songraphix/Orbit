import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { blockedSite, focusClock, focusRemaining } from '@shared/focus';
import type { FocusSession } from '@shared/focus';

/**
 * orbit://blocked/<address>: a site you asked Orbit to block while you focus. It says how long
 * is left, and lets you open it anyway (allowed for the rest of the session).
 */
export function BlockedPage({ encoded }: { encoded: string }) {
  const url = decodeURIComponent(encoded);
  const site = blockedSite(url, [hostOf(url)]) ?? hostOf(url);
  const [session, setSession] = useState<FocusSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = `${site} is blocked`;
    void window.orbit.invoke('focus:get', {}).then(setSession);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [site]);

  const left = session ? focusRemaining(session, now) : null;
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--color-white)] px-6 text-neutral-800"
      data-testid="blocked-page"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className="mb-5 grid size-14 place-items-center rounded-[18px] bg-[var(--accent-fill)] text-on-accent shadow-[0_10px_30px_-10px_var(--accent-fill)]">
          <Target size={26} />
        </span>
        <h1 className="text-[22px] font-semibold tracking-tight">You’re focusing</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-neutral-500">
          <span className="font-medium text-neutral-700">{site}</span> is blocked until your session
          ends
          {left !== null && left > 0 ? (
            <>
              {' '}
              — <span className="tabular-nums">{focusClock(left)}</span> left
            </>
          ) : null}
          .
        </p>
        {session?.title && session.title !== 'Focus' && (
          <p className="mt-1 text-[13px] text-neutral-400">On: {session.title}</p>
        )}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--accent-fill)] px-4 py-2 text-sm font-medium text-on-accent hover:brightness-110"
            onClick={() => (history.length > 1 ? history.back() : window.close())}
            data-testid="blocked-back"
          >
            Back to Work
          </button>
          <button
            type="button"
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            onClick={() => void window.orbit.invoke('focus:allow', { url })}
            data-testid="blocked-open"
          >
            Open Anyway
          </button>
        </div>
      </div>
    </main>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
