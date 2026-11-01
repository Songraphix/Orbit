import { File, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { relativeTime } from '@shared/time';
import type { DownloadView } from '@shared/types/downloads';

const act = (id: string, action: 'open' | 'reveal' | 'cancel' | 'dismiss' | 'drag') =>
  void window.orbit.invoke('downloads:act', { id, action });

/** Re-render every 30 s so "27 minutes ago" stays true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Recent downloads in the lower sidebar (F-10, Img 7): click to open, ⌘-click to reveal in
 * Finder, drag into another app. Items leave the shelf after an hour or when dismissed.
 */
export function DownloadsShelf({ items }: { items: DownloadView[] }) {
  const now = useNow();
  if (items.length === 0) return null;
  return (
    <ul className="no-drag flex shrink-0 flex-col gap-0.5 px-2 pb-1" data-testid="downloads-shelf">
      {items.slice(0, 5).map((d) => {
        const progress = d.totalBytes > 0 ? d.receivedBytes / d.totalBytes : 0;
        return (
          <li key={d.id}>
            <div
              role="button"
              tabIndex={0}
              draggable={d.state === 'completed'}
              onDragStart={(e) => {
                e.preventDefault(); // main starts a native file drag instead
                act(d.id, 'drag');
              }}
              onClick={(e) => act(d.id, e.metaKey ? 'reveal' : 'open')}
              onKeyDown={(e) => e.key === 'Enter' && act(d.id, 'open')}
              className="group flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-[var(--hover)]"
              title={d.state === 'completed' ? 'Open (⌘-click to show in Finder)' : d.filename}
              data-testid="download-item"
              data-state={d.state}
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--tile-bg)]">
                {d.thumbnail ? (
                  <img src={d.thumbnail} alt="" className="size-full object-cover" />
                ) : (
                  <File size={16} className="opacity-60" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{d.filename}</span>
                {d.state === 'progressing' ? (
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--hover)]">
                    <span
                      className="block h-full rounded-full bg-[var(--accent)] transition-[width]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </span>
                ) : (
                  <span className="block text-xs text-[var(--sidebar-muted)]">
                    {d.state === 'completed'
                      ? relativeTime(d.finishedAt ?? d.startedAt, now)
                      : d.state === 'cancelled'
                        ? 'Cancelled'
                        : 'Failed'}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={d.state === 'progressing' ? 'Cancel download' : 'Remove from shelf'}
                className="grid size-5 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  act(d.id, d.state === 'progressing' ? 'cancel' : 'dismiss');
                }}
                data-testid="download-dismiss"
              >
                <X size={13} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
