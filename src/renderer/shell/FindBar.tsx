import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FindState } from '@shared/types/find';

/**
 * Find in page (⌘F), drawn in the toolbar strip so it never needs to float over the page.
 * Enter = next, ⇧Enter = previous, Esc = close.
 */
export function FindBar({ state }: { state: FindState }) {
  const [query, setQuery] = useState(state.query);
  const input = useRef<HTMLInputElement>(null);

  // ⌘F again (focusToken bump) re-focuses and selects, like Chrome.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [state.focusToken]);

  const search = (text: string, direction?: 'next' | 'previous') =>
    void window.orbit.invoke('find:search', { query: text, ...(direction ? { direction } : {}) });

  return (
    <div
      className="no-drag absolute inset-x-28 mx-auto flex h-7 w-[min(420px,100%)] items-center gap-1.5 rounded-lg bg-black/5 px-2 text-[13px]"
      data-testid="find-bar"
    >
      <Search size={13} className="shrink-0 text-neutral-400" />
      <input
        ref={input}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            search(query, e.shiftKey ? 'previous' : 'next');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            void window.orbit.invoke('find:close', {});
          }
        }}
        placeholder="Find in page"
        aria-label="Find in page"
        className="h-full min-w-0 flex-1 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400"
        spellCheck={false}
        data-testid="find-input"
      />
      {state.query && (
        <span className="shrink-0 text-xs text-neutral-500 tabular-nums" data-testid="find-count">
          {state.matches === 0 ? 'No matches' : `${state.activeMatch}/${state.matches}`}
        </span>
      )}
      <button
        type="button"
        aria-label="Previous match"
        className="grid size-5 place-items-center rounded hover:bg-black/5"
        onClick={() => search(query, 'previous')}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        aria-label="Next match"
        className="grid size-5 place-items-center rounded hover:bg-black/5"
        onClick={() => search(query, 'next')}
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        aria-label="Close find"
        className="grid size-5 place-items-center rounded hover:bg-black/5"
        onClick={() => void window.orbit.invoke('find:close', {})}
        data-testid="find-close"
      >
        <X size={13} />
      </button>
    </div>
  );
}
