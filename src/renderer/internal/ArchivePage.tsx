import { Archive, Globe, ListFilter, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { groupByDay } from '@shared/time';
import type { InvokeOutput } from '@shared/ipc/contract';
import { SpaceIcon } from '../shell/sidebar/SpaceIcon';

type Result = InvokeOutput<'archive:list'>;
type Entry = Result['entries'][number];

const REASON = { auto: 'Auto-archived', closed: 'Closed', cleared: 'Cleared' } as const;

// Theme colours in the Library; plain ones on the standalone orbit://archive page.
const FG = 'text-[var(--sidebar-fg,var(--color-neutral-800))]';
const MUTED = 'text-[var(--sidebar-muted,var(--color-neutral-400))]';
const TILE = 'bg-[var(--tile-bg,var(--color-neutral-100))]';
const HOVER = 'hover:bg-[var(--hover,var(--color-neutral-100))]';

/**
 * Archived Tabs (F-20): closed, cleared and auto-archived tabs by day, searchable, filterable by
 * how they closed and which space they were in (like Arc), restorable. Shown in the Library
 * (`embedded`) and at orbit://archive.
 */
export function ArchivePage({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<(Result & { at: number }) | null>(null);
  const [version, setVersion] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const [how, setHow] = useState<'auto' | 'manual' | null>(null);
  const [where, setWhere] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void window.orbit
        .invoke('archive:list', { query })
        .then((r) => setResult({ ...r, at: Date.now() }));
    }, 80);
    return () => clearTimeout(timer);
  }, [query, version]);

  const entries = (result?.entries ?? []).filter(
    (e) =>
      (how === null || (how === 'auto') === (e.reason === 'auto')) &&
      (where === null || e.spaceId === where),
  );
  const refresh = () => setVersion((v) => v + 1);

  return (
    <div className={embedded ? '' : 'mx-auto max-w-3xl px-8 py-10'} data-testid="archive-page">
      {!embedded && (
        <>
          <h1 className={`flex items-center gap-2 text-2xl font-semibold ${FG}`}>
            <Archive size={22} /> Archived Tabs
          </h1>
          <p className={`mt-1 mb-6 text-sm ${MUTED}`}>
            Today tabs you close, clear, or leave unopened for a while end up here.
          </p>
        </>
      )}
      <div className="mb-4 flex items-center gap-2">
        <label className={`flex h-10 flex-1 items-center gap-2 rounded-xl px-3 ${TILE}`}>
          <Search size={15} className={MUTED} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Archived Tabs…"
            className={`h-full flex-1 bg-transparent text-sm outline-none ${FG}`}
            data-testid="archive-search"
          />
        </label>
        <button
          type="button"
          onClick={() => setFiltering((f) => !f)}
          aria-pressed={filtering}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium ${TILE} ${FG} ${HOVER}`}
          data-testid="archive-filter"
        >
          <ListFilter size={15} /> {filtering ? 'Done' : 'Filter'}
        </button>
      </div>

      {filtering && (
        <div className={`mb-4 flex flex-col gap-3 ${FG}`} data-testid="archive-filters">
          <FilterGroup title="How was the tab closed?">
            <Chip
              on={how === 'auto'}
              onClick={() => setHow(how === 'auto' ? null : 'auto')}
              testId="filter-auto"
            >
              Auto-Closed
            </Chip>
            <Chip
              on={how === 'manual'}
              onClick={() => setHow(how === 'manual' ? null : 'manual')}
              testId="filter-manual"
            >
              Manually Closed
            </Chip>
          </FilterGroup>
          {(result?.spaces.length ?? 0) > 1 && (
            <FilterGroup title="Where was the tab?">
              {result!.spaces.map((s) => (
                <Chip
                  key={s.id}
                  on={where === s.id}
                  onClick={() => setWhere(where === s.id ? null : s.id)}
                  testId="filter-space"
                >
                  <SpaceIcon icon={s.icon} size={13} /> {s.name}
                </Chip>
              ))}
            </FilterGroup>
          )}
        </div>
      )}

      {result && entries.length === 0 && (
        <p className={`mt-10 text-center text-sm ${MUTED}`}>
          {query || how || where ? 'No archived tabs match.' : 'Nothing archived yet.'}
        </p>
      )}

      {result &&
        groupByDay(entries, (e) => e.archivedAt, result.at).map(([label, items]) => (
          <section key={label} className="mb-4">
            <h2 className={`mb-1 px-1 text-[12px] font-semibold ${MUTED}`}>{label}</h2>
            <ul className="flex flex-col">
              {items.map((e) => (
                <ArchiveRow key={e.id} entry={e} onChange={refresh} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function ArchiveRow({ entry: e, onChange }: { entry: Entry; onChange: () => void }) {
  return (
    <li
      className={`group flex items-center gap-3 rounded-xl px-2 py-2 ${FG} ${HOVER}`}
      data-testid="archive-entry"
    >
      {e.favicon ? (
        <img src={e.favicon} alt="" className="size-4 shrink-0 rounded-sm" />
      ) : (
        <Globe size={16} className={`shrink-0 ${MUTED}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{e.title || e.url}</div>
        <div className={`truncate text-[12px] ${MUTED}`}>
          {e.url.replace(/^https?:\/\/(www\.)?/, '')} · {REASON[e.reason]} at{' '}
          {new Date(e.archivedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        className={`grid size-7 shrink-0 place-items-center rounded-lg opacity-0 group-hover:opacity-100 ${MUTED} ${HOVER}`}
        onClick={() => void window.orbit.invoke('archive:delete', { id: e.id }).then(onChange)}
        data-testid="archive-delete"
      >
        <Trash2 size={14} />
      </button>
      <button
        type="button"
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${HOVER}`}
        onClick={() => void window.orbit.invoke('archive:restore', { id: e.id }).then(onChange)}
        data-testid="archive-restore"
      >
        <RotateCcw size={13} /> Restore
      </button>
    </li>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className={`mb-1.5 px-1 text-[12px] font-semibold ${MUTED}`}>{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip(props: { on: boolean; onClick: () => void; testId: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
        props.on ? 'bg-[var(--accent,#2f7d75)] text-on-accent' : `${TILE} ${HOVER}`
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
