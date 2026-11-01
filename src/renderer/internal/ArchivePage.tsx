import { Archive, Globe, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { InvokeOutput } from '@shared/ipc/contract';

type Entry = InvokeOutput<'archive:list'>['entries'][number];

const REASON = { auto: 'Auto-archived', closed: 'Closed', cleared: 'Cleared' } as const;

function dayLabel(ms: number): string {
  const day = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

/** orbit://archive — closed, cleared and auto-archived tabs, searchable and restorable (F-20). */
export function ArchivePage() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      void window.orbit.invoke('archive:list', { query }).then((r) => setEntries(r.entries));
    }, 80);
    return () => clearTimeout(timer);
  }, [query, version]);

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const label = dayLabel(e.archivedAt);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 text-neutral-800" data-testid="archive-page">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        <Archive size={22} /> Archived Tabs
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Today tabs you close, clear, or leave unopened for a while end up here.
      </p>
      <label className="mt-6 flex h-10 items-center gap-2 rounded-xl border border-neutral-200 px-3 focus-within:border-neutral-400">
        <Search size={16} className="text-neutral-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search archived tabs"
          className="h-full flex-1 bg-transparent text-sm outline-none"
          data-testid="archive-search"
        />
      </label>

      {entries.length === 0 && (
        <p className="mt-10 text-center text-sm text-neutral-400">
          {query ? 'No archived tabs match.' : 'Nothing archived yet.'}
        </p>
      )}

      {[...groups].map(([label, items]) => (
        <section key={label} className="mt-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            {label}
          </h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {items.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5"
                data-testid="archive-entry"
              >
                {e.favicon ? (
                  <img src={e.favicon} alt="" className="size-4 shrink-0 rounded-sm" />
                ) : (
                  <Globe size={16} className="shrink-0 text-neutral-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{e.title || e.url}</div>
                  <div className="truncate text-xs text-neutral-400">
                    {e.url.replace(/^https?:\/\/(www\.)?/, '')} · {REASON[e.reason]} at{' '}
                    {new Date(e.archivedAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                  onClick={() =>
                    void window.orbit
                      .invoke('archive:restore', { id: e.id })
                      .then(() => setVersion((v) => v + 1))
                  }
                  data-testid="archive-restore"
                >
                  <RotateCcw size={13} /> Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
