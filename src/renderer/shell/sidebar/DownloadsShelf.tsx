import { ArrowDown, File, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { progressLabel, timeLeftLabel } from '@shared/download-format';
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

const RING = 2 * Math.PI * 17;

/** The blue download badge with a progress ring round it (Arc, Img 7). */
function ProgressBadge({ progress }: { progress: number | null }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="none"
          stroke="#0a84ff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - (progress ?? 0.08))}
          className={`transition-[stroke-dashoffset] duration-500 ease-out ${progress === null ? 'origin-center animate-spin' : ''}`}
        />
      </svg>
      <span className="grid size-[26px] place-items-center rounded-full bg-[#0a84ff] text-on-accent shadow-[0_2px_6px_-1px_rgb(10_132_255/0.6)]">
        <ArrowDown size={15} strokeWidth={2.6} />
      </span>
    </span>
  );
}

/**
 * Downloads in the lower sidebar (F-10, Img 7, like Arc): a rounded card per file — a progress
 * ring and "176.8/320.7 MB · 14s" while it downloads, a preview once it's done. Click to open,
 * ⌘-click to show in Finder, drag into another app. Finished items leave after an hour.
 */
export function DownloadsShelf({ items }: { items: DownloadView[] }) {
  const now = useNow();
  if (items.length === 0) return null;
  return (
    <ul
      className="no-drag flex shrink-0 flex-col gap-1.5 px-2.5 pb-1.5"
      data-testid="downloads-shelf"
    >
      {items.slice(0, 4).map((d) => {
        const progress = d.totalBytes > 0 ? d.receivedBytes / d.totalBytes : null;
        const left = timeLeftLabel(d.totalBytes - d.receivedBytes, d.speed);
        return (
          <li key={d.id} className="animate-rise">
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
              className="press group flex items-center gap-2.5 rounded-[16px] bg-[var(--tile-bg)] p-2 pr-2.5 shadow-[inset_0_0.5px_0_rgb(255_255_255/0.08)] hover:bg-[var(--row-active)]"
              title={d.state === 'completed' ? 'Open (⌘-click to show in Finder)' : d.filename}
              data-testid="download-item"
              data-state={d.state}
            >
              {d.state === 'progressing' ? (
                <ProgressBadge progress={progress} />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[11px] bg-[var(--tile-bg)]">
                  {d.thumbnail ? (
                    <img src={d.thumbnail} alt="" className="size-full object-cover" />
                  ) : (
                    <File size={17} className="opacity-60" />
                  )}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{d.filename}</span>
                <span className="block truncate text-[11.5px] text-[var(--sidebar-muted)] tabular-nums">
                  {d.state === 'progressing'
                    ? `${progressLabel(d.receivedBytes, d.totalBytes)}${left ? ` · ${left}` : ''}`
                    : d.state === 'completed'
                      ? relativeTime(d.finishedAt ?? d.startedAt, now)
                      : d.state === 'cancelled'
                        ? 'Cancelled'
                        : 'Failed'}
                </span>
              </span>
              <button
                type="button"
                aria-label={d.state === 'progressing' ? 'Cancel download' : 'Remove from shelf'}
                className={`grid size-7 shrink-0 place-items-center rounded-[9px] bg-[var(--hover)] hover:bg-[var(--row-active)] ${
                  d.state === 'progressing' ? '' : 'opacity-0 group-hover:opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  act(d.id, d.state === 'progressing' ? 'cancel' : 'dismiss');
                }}
                data-testid="download-dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
