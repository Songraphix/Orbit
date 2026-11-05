import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FindState } from '@shared/types/find';

/**
 * Find in page (⌘F), in place of the address pill so it never needs to float over the page.
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
      className="no-drag mat-light flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 text-[13px]"
      data-testid="find-bar"
    >
      <Search size={14} className="shrink-0 text-[var(--fg-faint)]" />
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
        className="h-full min-w-0 flex-1 bg-transparent text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)]"
        spellCheck={false}
        data-testid="find-input"
      />
      {state.query && (
        <span
          className="shrink-0 text-xs text-[var(--fg-muted)] tabular-nums"
          data-testid="find-count"
        >
          {state.matches === 0 ? 'No matches' : `${state.activeMatch}/${state.matches}`}
        </span>
      )}
      <button
        type="button"
        aria-label="Previous match"
        className="grid size-5 place-items-center rounded-full hover:bg-[var(--glass-hover)]"
        onClick={() => search(query, 'previous')}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        aria-label="Next match"
        className="grid size-5 place-items-center rounded-full hover:bg-[var(--glass-hover)]"
        onClick={() => search(query, 'next')}
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        aria-label="Close find"
        className="grid size-5 place-items-center rounded-full hover:bg-[var(--glass-hover)]"
        onClick={() => void window.orbit.invoke('find:close', {})}
        data-testid="find-close"
      >
        <X size={13} />
      </button>
    </div>
  );
}
