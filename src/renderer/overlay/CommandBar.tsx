import { Glass } from './Glass';
import {
  Archive,
  ArrowRight,
  Bookmark,
  Clock,
  FileText,
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
import type { VoiceState } from '@shared/voice';
import { VoiceStatus, VoiceButton } from './Voice';
import { useVoice } from './use-voice';

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
  /** The words in the box were spoken (not typed or edited since). */
  const [spoken, setSpoken] = useState(false);
  /** Run the top result once spoken words' results arrive (Settings → Voice → Run right away). */
  const autoRun = useRef(false);
  const voice = useVoice((text, runAtOnce) => {
    setQuery(text);
    setSpoken(true);
    autoRun.current = runAtOnce;
    input.current?.focus();
  });
  const voiceBusy = isBusy(voice);

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
          if (autoRun.current && next[0]) {
            autoRun.current = false;
            void window.orbit.invoke('commandbar:execute', { item: next[0], voice: true });
          }
        });
      },
      query ? 40 : 0,
    );
    return () => clearTimeout(timer);
  }, [query]);

  /** ⌥ opens a tab or an address beside the current page, in split view (roadmap P2.4). */
  const run = (item: CommandItem | undefined, split = false) => {
    if (item) void window.orbit.invoke('commandbar:execute', { item, split, voice: spoken });
  };

  // Closing the bar while listening stops the microphone.
  const busy = useRef(false);
  useEffect(() => {
    busy.current = voiceBusy;
  }, [voiceBusy]);
  useEffect(
    () => () => {
      if (busy.current) void window.orbit.invoke('voice:cancel', {});
    },
    [],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Esc first stops listening; again closes the bar.
      if (voiceBusy || voice.phase === 'needs-model' || voice.phase === 'error') {
        void window.orbit.invoke('voice:cancel', {});
      } else close();
    } else if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const split = e.altKey;
      if (itemsQuery === query) {
        run(items[selected], split);
      } else {
        // Typed faster than results arrived: act on exactly what's typed (its top result).
        requestSeq.current++;
        void window.orbit
          .invoke('commandbar:query', { query })
          .then(({ items: fresh }) => run(fresh[0], split));
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
            onChange={(e) => {
              setQuery(e.target.value);
              setSpoken(false);
              autoRun.current = false;
            }}
            onKeyDown={onKeyDown}
            placeholder={voicePlaceholder(voice) ?? 'Search or enter address…'}
            aria-label="Search or enter address"
            aria-controls="command-results"
            aria-activedescendant={items[selected] ? `cmd-${selected}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[19px] font-medium tracking-[-0.01em] outline-none placeholder:font-normal placeholder:text-white/35"
            spellCheck={false}
            autoComplete="off"
            data-testid="command-input"
            data-spoken={spoken}
          />
          <VoiceButton voice={voice} />
        </div>
        <VoiceStatus voice={voice} />
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
                  run(item, e.altKey);
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

const isBusy = (voice: VoiceState) =>
  voice.phase === 'listening' ||
  voice.phase === 'loading' ||
  voice.phase === 'transcribing' ||
  voice.phase === 'downloading';

/** While listening, the box says so (what's heard arrives as text when you stop). */
function voicePlaceholder(voice: VoiceState): string | null {
  if (voice.phase === 'listening') return 'Listening…';
  if (voice.phase === 'loading') return 'Getting ready to listen…';
  if (voice.phase === 'transcribing') return 'Writing down what you said…';
  return null;
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
    case 'capture':
      return <Bookmark {...props} />;
    case 'archived':
      return <Archive {...props} />;
    case 'ask':
      return <Sparkles {...props} />;
    case 'drive':
      return <FileText {...props} />;
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
