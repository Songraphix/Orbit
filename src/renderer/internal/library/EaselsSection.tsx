import { PenTool, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { EaselEntry } from '@shared/types/easels';
import { Empty, IconButton, SearchField } from './LibraryPage';

const invoke = window.orbit.invoke;

/** Library → Easels (F-19): every Easel with its preview; open, delete, or make a new one. */
export function EaselsSection() {
  const [easels, setEasels] = useState<EaselEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const reload = useCallback(
    () => void invoke('library:easels', {}).then((r) => setEasels(r.easels)),
    [],
  );
  useEffect(() => {
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);
  const shown = easels?.filter((e) => e.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search Easels…"
        testId="easels-search"
      >
        <button
          type="button"
          onClick={() => void invoke('library:easelAct', { action: 'new' })}
          className="press flex h-10 shrink-0 items-center gap-1.5 rounded-[14px] bg-[var(--tile-bg)] px-3 text-[13px] font-semibold whitespace-nowrap hover:bg-[var(--hover)]"
          data-testid="easel-new"
        >
          <Plus size={15} /> New Easel
        </button>
      </SearchField>
      {easels && easels.length === 0 && (
        <Empty>
          No Easels yet. Press ⌃⇧E to start one: draw, write notes and capture web pages.
        </Empty>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3">
        {shown?.map((easel) => (
          <figure key={easel.id} className="group" data-testid="easel-entry">
            <button
              type="button"
              onClick={() => void invoke('library:easelAct', { id: easel.id, action: 'open' })}
              className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[20px] bg-[var(--tile-bg)] p-2 hover:bg-[var(--hover)]"
              title={`Open ${easel.title}`}
            >
              {easel.preview ? (
                <img
                  src={easel.preview}
                  alt=""
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              ) : (
                <PenTool size={28} className="text-[var(--sidebar-muted)]" />
              )}
            </button>
            <figcaption className="mt-1.5 flex items-center gap-2 px-1">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{easel.title}</div>
                <div className="text-[12px] text-[var(--sidebar-muted)]">
                  {new Date(easel.updatedAt).toLocaleDateString([], {
                    day: 'numeric',
                    month: 'short',
                  })}
                </div>
              </div>
              <IconButton
                onClick={() =>
                  void invoke('library:easelAct', { id: easel.id, action: 'delete' }).then(reload)
                }
                label="Delete Easel"
                testId="easel-delete"
              >
                <Trash2 size={14} />
              </IconButton>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
