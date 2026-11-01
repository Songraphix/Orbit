import { File } from 'lucide-react';
import { useEffect, useState } from 'react';
import { relativeTime } from '@shared/time';
import type { RecentDownload } from '@shared/types/downloads';

const act = (id: string, action: 'open' | 'reveal' | 'drag') =>
  void window.orbit.invoke('downloads:act', { id, action });

/**
 * Hovering the Library button (like Arc): the latest files downloaded through Orbit. Click to
 * open, ⌘-click to show in Finder, drag into another app; clicking the button opens the Library.
 */
export function RecentFiles() {
  const [loaded, setLoaded] = useState<{ items: RecentDownload[]; at: number } | null>(null);
  useEffect(() => {
    void window.orbit
      .invoke('downloads:recent', {})
      .then((r) => setLoaded({ items: r.items, at: Date.now() }));
  }, []);
  if (!loaded) return null;
  const { items, at: now } = loaded;
  return (
    <div
      className="absolute right-0 bottom-full left-0 mb-1 rounded-xl bg-[var(--tile-bg)] p-1 shadow-lg backdrop-blur-xl animate-[orbit-fade-in_100ms_ease-out]"
      style={{ background: 'var(--sidebar-bg)' }}
      data-testid="recent-files"
    >
      {items.length === 0 ? (
        <p className="px-2 py-2 text-[12px] text-[var(--sidebar-muted)]">No downloads yet</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((d) => (
            <li key={d.id}>
              <div
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => {
                  e.preventDefault(); // main starts a native file drag instead
                  act(d.id, 'drag');
                }}
                onClick={(e) => act(d.id, e.metaKey ? 'reveal' : 'open')}
                onKeyDown={(e) => e.key === 'Enter' && act(d.id, 'open')}
                className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-[var(--hover)]"
                title="Open (⌘-click to show in Finder)"
                data-testid="recent-file"
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
                  <span className="block text-[11px] text-[var(--sidebar-muted)]">
                    {relativeTime(d.finishedAt, now)}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
