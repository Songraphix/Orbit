import { Glass } from './Glass';
import {
  ArrowRight,
  Clock,
  FolderClosed,
  Globe,
  Layers,
  NotebookPen,
  Search,
  Sparkles,
  SquareCheck,
  TerminalSquare,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CommandBarMode, CommandItem } from '@shared/types/command-bar';

const close = () => void window.orbit.invoke('overlay:close', {});

/**
 * The ⌘T / ⌘L command bar (F-21). Results are built and ranked in main; this draws them and
 * handles the keyboard. Typing is debounced lightly; only the newest response is shown.
 */
export function CommandBar({ mode, initialQuery }: { mode: CommandBarMode; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<CommandItem[]>([]);
  /** The query the shown items were built for (they lag typing slightly). */
  const [itemsQuery, setItemsQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    input.current?.focus();
    input.current?.select(); // ⌘L: the current URL is selected, ready to overwrite
  }, []);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const timer = setTimeout(
      () => {
        void window.orbit.invoke('commandbar:query', { query }).then(({ items: next }) => {
          if (seq !== requestSeq.current) return; // a newer query is in flight
          setItems(next);
          setItemsQuery(query);
          setSelected(0);
        });
      },
      query ? 40 : 0,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const run = (item: CommandItem | undefined) => {
    if (item) void window.orbit.invoke('commandbar:execute', { item });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (itemsQuery === query) {
        run(items[selected]);
      } else {
        // Typed faster than results arrived: act on exactly what's typed (its top result).
        requestSeq.current++;
        void window.orbit
          .invoke('commandbar:query', { query })
          .then(({ items: fresh }) => run(fresh[0]));
      }
    }
  };

  return (
    <div
      className="fixed inset-0 flex justify-center bg-black/[0.14] pt-[17vh] animate-[orbit-fade-in_160ms_var(--ease-out)]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-testid="command-bar-backdrop"
    >
      <Glass
        className="animate-pop h-fit w-[min(660px,90vw)] rounded-[24px]"
        role="dialog"
        aria-label={mode === 'edit' ? 'Edit address' : 'New tab'}
        data-testid="command-bar"
      >
        <div className="flex h-[60px] items-center gap-3 px-5">
          <Search size={19} strokeWidth={2.2} className="shrink-0 opacity-50" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or enter address…"
            aria-label="Search or enter address"
            aria-controls="command-results"
            aria-activedescendant={items[selected] ? `cmd-${selected}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[19px] font-medium tracking-[-0.01em] outline-none placeholder:font-normal placeholder:text-white/35"
            spellCheck={false}
            autoComplete="off"
            data-testid="command-input"
          />
        </div>
        {items.length > 0 && (
          <ul
            id="command-results"
            role="listbox"
            className="max-h-[440px] overflow-y-auto border-t border-white/[0.08] p-2"
            data-testid="command-results"
          >
            {items.map((item, i) => (
              <li
                key={item.id}
                id={`cmd-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`flex h-11 cursor-default items-center gap-3 rounded-[13px] px-3 text-[14px] transition-colors duration-100 ${
                  i === selected
                    ? 'bg-white/[0.12] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.12)]'
                    : 'text-white/85'
                }`}
                onMouseMove={() => setSelected(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(item);
                }}
                data-testid="command-item"
                data-kind={item.kind}
              >
                <ItemIcon item={item} />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span
                  className={`shrink-0 text-[12px] ${i === selected ? 'text-white/70' : 'text-white/35'}`}
                >
                  {item.subtitle}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Glass>
    </div>
  );
}

/** Each result's icon sits on a small lit tile, like Arc's. */
function ItemIcon({ item }: { item: CommandItem }) {
  return (
    <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-white/[0.08] shadow-[inset_0_0.5px_0_rgb(255_255_255/0.1)]">
      <Glyph item={item} />
    </span>
  );
}

function Glyph({ item }: { item: CommandItem }) {
  if (item.favicon) return <img src={item.favicon} alt="" className="size-4 shrink-0 rounded-sm" />;
  const props = { size: 16, className: 'shrink-0 opacity-70' };
  switch (item.kind) {
    case 'navigate':
      return <ArrowRight {...props} />;
    case 'search':
    case 'suggestion':
      return <Search {...props} />;
    case 'tab':
      return <Layers {...props} />;
    case 'history':
      return <Clock {...props} />;
    case 'project':
      return <FolderClosed {...props} />;
    case 'task':
      return <SquareCheck {...props} />;
    case 'note':
      return <NotebookPen {...props} />;
    case 'command':
      return item.commandId === 'new-tab-page' ? (
        <Sparkles {...props} />
      ) : (
        <TerminalSquare {...props} />
      );
    default:
      return <Globe {...props} />;
  }
}
