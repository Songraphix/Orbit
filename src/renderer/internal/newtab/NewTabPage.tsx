import {
  Check,
  Crosshair,
  ImagePlus,
  LayoutGrid,
  Moon,
  Plus,
  Quote,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { greetingFor } from '@shared/profile';
import { quoteFor } from '@shared/quotes';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';
import type { NewTabState, WallpaperChoice } from '@shared/types/newtab';
import type { Shortcut } from '@shared/types/home';
import { GRAIN, WALLPAPER_CSS } from './wallpapers';

const invoke = window.orbit.invoke;

/** Main's error text without Electron's "Error invoking remote method…" prefix. */
const messageOf = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^Error: /, '');

/**
 * orbit://newtab (owner request, 2026-11-01): the time, a greeting by name, your tagline, a
 * search box, shortcuts to your sites, today's to-dos and a quote, over a wallpaper. Dark or
 * light glass; everything can be switched off in Customise.
 */
export function NewTabPage() {
  const [state, setState] = useState<NewTabState | null>(null);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    void invoke('newtab:get', {}).then(setState);
  }, []);

  const light = state?.home.theme === 'light';
  return (
    <main
      className={`relative h-full overflow-y-auto ${light ? 'text-neutral-900' : 'text-white'}`}
      data-theme={light ? 'light' : 'dark'}
      data-testid="newtab"
    >
      <Wallpaper state={state} light={light} />
      <div className="absolute top-5 right-5 z-10 flex gap-2">
        <CornerButton
          label={light ? 'Dark Glass' : 'Light Glass'}
          light={light}
          onClick={() =>
            state &&
            void invoke('newtab:setHome', { theme: light ? 'dark' : 'light' }).then(setState)
          }
          testId="theme-toggle"
        >
          {light ? <Moon size={18} /> : <Sun size={18} />}
        </CornerButton>
        <CornerButton
          label="Customize"
          light={light}
          onClick={() => setCustomizing((open) => !open)}
          expanded={customizing}
          testId="customize-button"
        >
          <LayoutGrid size={18} />
        </CornerButton>
      </div>

      {state && (
        <div className="relative flex min-h-full flex-col px-8 pt-[6vh] pb-6">
          <section className="flex flex-col items-center text-center">
            <Clock />
            <Greeting name={state.name} onChange={setState} />
            {state.home.tagline && (
              <p className="mt-2 text-[17px] opacity-85" data-testid="tagline">
                {state.home.tagline}
              </p>
            )}
            <SearchBox light={light} />
            {state.home.show.shortcuts && (
              <Shortcuts shortcuts={state.shortcuts} light={light} onChange={setState} />
            )}
          </section>
          <div className="min-h-6 flex-1" />
          <section className="flex flex-wrap items-end justify-between gap-6">
            {state.home.show.today ? (
              <Today todos={state.todos} light={light} onChange={setState} />
            ) : (
              <span />
            )}
            {state.home.show.quote && <QuoteCard light={light} />}
          </section>
        </div>
      )}

      {customizing && state && (
        <CustomizePanel state={state} onChange={setState} onClose={() => setCustomizing(false)} />
      )}
    </main>
  );
}

/** The glass every widget sits on. */
function glass(light: boolean): string {
  return light
    ? 'border border-white/70 bg-white/65 shadow-[0_10px_40px_-12px_rgb(0_0_0/0.25)] backdrop-blur-2xl'
    : 'border border-white/[0.14] bg-[rgb(12_16_36/0.42)] shadow-[0_10px_40px_-12px_rgb(0_0_0/0.5)] backdrop-blur-2xl';
}

function CornerButton(props: {
  label: string;
  light: boolean;
  onClick: () => void;
  expanded?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.expanded}
      onClick={props.onClick}
      className={`press grid size-12 place-items-center rounded-[16px] ${glass(props.light)} ${
        props.light ? 'hover:bg-white/85' : 'hover:bg-[rgb(12_16_36/0.6)]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}

function Wallpaper({ state, light }: { state: NewTabState | null; light: boolean }) {
  const choice = state?.wallpaper;
  const background =
    choice?.kind === 'custom' && state?.customImage
      ? `center / cover no-repeat url("${state.customImage}")`
      : WALLPAPER_CSS[choice?.kind === 'builtin' ? choice.id : 'aurora'];

  return (
    <div
      className="fixed inset-0 transition-[background] duration-500"
      style={{ background }}
      data-testid="wallpaper"
      data-wallpaper={choice ? (choice.kind === 'custom' ? 'custom' : choice.id) : 'loading'}
    >
      {/* Grain plus a soft vignette keeps text readable on any wallpaper; light glass adds a
          pale veil instead. */}
      <div
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{ background: GRAIN }}
      />
      <div
        className={`absolute inset-0 transition-colors duration-500 ${
          light
            ? 'bg-white/45'
            : 'bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.35)_100%)]'
        }`}
      />
    </div>
  );
}

/** "Good evening" → "Good Evening", as on the page. */
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on each minute boundary rather than polling every second.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

function Clock() {
  const now = useMinute();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className="[text-shadow:0_2px_24px_rgb(0_0_0/0.18)]">
      <div
        className="text-[clamp(48px,min(8.5vw,11vh),96px)] leading-none font-bold tracking-[-0.03em] tabular-nums"
        data-testid="clock"
      >
        {time}
      </div>
      <div className="mt-2 text-[17px] font-medium opacity-75">{date}</div>
    </div>
  );
}

function Greeting({ name, onChange }: { name: string; onChange: (s: NewTabState) => void }) {
  const now = useMinute();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const hello = titleCase(greetingFor(now.getHours()));
  const save = () => {
    setEditing(false);
    if (value.trim() !== name) void invoke('newtab:setName', { name: value.trim() }).then(onChange);
  };
  return (
    <div className="mt-[3.5vh] flex flex-col items-center">
      <h1
        className="text-[clamp(26px,3.4vw,38px)] font-bold tracking-[-0.02em] [text-shadow:0_2px_20px_rgb(0_0_0/0.15)]"
        data-testid="greeting"
      >
        {hello}
        {name && `, ${name}`}{' '}
        <span className="inline-block origin-[70%_70%] animate-[wave_1.6s_ease-in-out_1]">👋</span>
      </h1>
      {!name &&
        (editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              ref={(el) => el?.focus()}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              maxLength={40}
              placeholder="Your name"
              className="mt-2 h-8 w-48 rounded-full bg-white/20 px-3.5 text-center text-[14px] outline-none placeholder:opacity-60"
              data-testid="greeting-name"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1.5 text-[13px] underline decoration-current/40 underline-offset-4 opacity-70 hover:opacity-100"
            data-testid="greeting-add-name"
          >
            Add your name
          </button>
        ))}
    </div>
  );
}

function SearchBox({ light }: { light: boolean }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // The tab gets focus when it opens; put the caret straight into the box. ⌘K comes back to it.
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = value.trim();
    if (query) void invoke('newtab:navigate', { input: query });
  };

  return (
    <form onSubmit={submit} className="mt-[4vh] w-full max-w-[880px]" role="search">
      <label
        className={`flex h-[62px] items-center gap-4 rounded-full px-7 transition focus-within:ring-2 ${
          light ? 'focus-within:ring-black/10' : 'focus-within:ring-white/25'
        } ${glass(light)}`}
      >
        <Search size={22} className="shrink-0 opacity-80" />
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search the web"
          aria-label="Search or enter an address"
          className={`h-full min-w-0 flex-1 bg-transparent text-[18px] outline-none ${
            light ? 'placeholder:text-neutral-500' : 'placeholder:text-white/65'
          }`}
          spellCheck={false}
          autoComplete="off"
          data-testid="newtab-search"
        />
        <span className="flex shrink-0 gap-1 text-[13px] font-medium opacity-70" aria-hidden>
          <kbd className={`rounded-[7px] px-2 py-0.5 ${light ? 'bg-black/[0.07]' : 'bg-white/15'}`}>
            ⌘
          </kbd>
          <kbd className={`rounded-[7px] px-2 py-0.5 ${light ? 'bg-black/[0.07]' : 'bg-white/15'}`}>
            K
          </kbd>
        </span>
      </label>
    </form>
  );
}

const LETTER_COLORS = ['#5b5bd6', '#0a84ff', '#30a46c', '#e5484d', '#f76b15', '#d6409f'];

function ShortcutIcon({ shortcut }: { shortcut: Shortcut }) {
  if (shortcut.icon) {
    return <img src={shortcut.icon} alt="" className="size-9 rounded-[9px] object-contain" />;
  }
  const letter = shortcut.title.charAt(0).toUpperCase() || '?';
  const color = LETTER_COLORS[letter.charCodeAt(0) % LETTER_COLORS.length];
  return (
    <span
      className="grid size-9 place-items-center rounded-[10px] text-[17px] font-bold text-white"
      style={{ background: color }}
    >
      {letter}
    </span>
  );
}

function Shortcuts({
  shortcuts,
  light,
  onChange,
}: {
  shortcuts: Shortcut[];
  light: boolean;
  onChange: (s: NewTabState) => void;
}) {
  const [adding, setAdding] = useState(false);
  const tile = `grid size-[78px] place-items-center rounded-[22px] ${glass(light)}`;
  return (
    <ul
      className="mt-[4.5vh] flex flex-wrap justify-center gap-x-6 gap-y-4"
      data-testid="shortcuts"
    >
      {shortcuts.map((s) => (
        <li key={s.id} className="group relative animate-row-in">
          <button
            type="button"
            onClick={() => void invoke('newtab:navigate', { input: s.url })}
            className="press flex w-[86px] flex-col items-center gap-2"
            title={s.url}
            data-testid="shortcut"
          >
            <span className={`${tile} transition group-hover:-translate-y-0.5`}>
              <ShortcutIcon shortcut={s} />
            </span>
            <span
              className="max-w-full truncate text-[14px] font-medium [text-shadow:0_1px_8px_rgb(0_0_0/0.2)]"
              data-testid="shortcut-name"
            >
              {s.title}
            </span>
          </button>
          <button
            type="button"
            aria-label={`Remove ${s.title}`}
            onClick={() =>
              void invoke('newtab:shortcut', { action: 'remove', id: s.id }).then(onChange)
            }
            className="absolute -top-1.5 right-0.5 grid size-6 place-items-center rounded-full bg-neutral-900/80 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-neutral-900"
            data-testid="shortcut-remove"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        </li>
      ))}
      {shortcuts.length < 10 && (
        <li className="relative">
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            className="press flex w-[86px] flex-col items-center gap-2"
            data-testid="shortcut-add"
          >
            <span className={tile}>
              <Plus size={26} strokeWidth={1.75} className="opacity-85" />
            </span>
            <span className="text-[14px] font-medium">Add</span>
          </button>
          {adding && (
            <AddShortcut light={light} onClose={() => setAdding(false)} onChange={onChange} />
          )}
        </li>
      )}
    </ul>
  );
}

function AddShortcut({
  light,
  onClose,
  onChange,
}: {
  light: boolean;
  onClose: () => void;
  onChange: (s: NewTabState) => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = `h-9 w-full rounded-[11px] px-3 text-[14px] outline-none ${
    light ? 'bg-black/[0.06] placeholder:text-neutral-500' : 'bg-white/10 placeholder:text-white/45'
  }`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    invoke('newtab:shortcut', { action: 'add', title, url }).then(
      (next) => {
        onChange(next);
        onClose();
      },
      (err: unknown) => {
        setBusy(false);
        setError(messageOf(err));
      },
    );
  };
  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className={`animate-pop absolute top-full left-1/2 z-20 mt-3 w-64 -translate-x-1/2 rounded-[18px] p-3 text-left ${glass(light)}`}
      data-testid="shortcut-form"
    >
      <input
        ref={(el) => el?.focus()}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Address (figma.com)"
        className={field}
        data-testid="shortcut-url"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Name (optional)"
        maxLength={40}
        className={`${field} mt-2`}
        data-testid="shortcut-title"
      />
      {error && (
        <p className="mt-2 text-[12px] text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1.5 text-[13px] opacity-75"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="press rounded-full bg-[#0a84ff] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          data-testid="shortcut-save"
        >
          Add
        </button>
      </div>
    </form>
  );
}

function Today({
  todos,
  light,
  onChange,
}: {
  todos: NewTabState['todos'];
  light: boolean;
  onChange: (s: NewTabState) => void;
}) {
  const [text, setText] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void invoke('newtab:todo', { action: 'add', text: text.trim() }).then((next) => {
      onChange(next);
      setText('');
    });
  };
  return (
    <section
      className={`w-[min(440px,100%)] rounded-[26px] px-6 pt-4 pb-3 ${glass(light)}`}
      aria-label="Today"
      data-testid="today"
    >
      <h2 className="mb-2 flex items-center gap-2.5 text-[18px] font-semibold">
        <Crosshair size={20} />
        {/* Your tasks due today (and overdue), the same as the panel's Tasks → Today. */}
        <button
          type="button"
          className="flex-1 text-left hover:underline"
          title="Open in Tasks"
          onClick={() => void invoke('notes:panel', { view: 'tasks' })}
          data-testid="today-open-tasks"
        >
          Today
        </button>
        {todos.some((t) => !t.done) && (
          <span className="text-[13px] font-normal opacity-60" data-testid="focus-remaining">
            {todos.filter((t) => !t.done).length} remaining
          </span>
        )}
      </h2>
      {todos.length === 0 && (
        <p className="mb-1 text-[13.5px] opacity-60" data-testid="today-empty">
          Nothing due today. Tasks with today’s date show here.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {todos.map((t) => (
          <li key={t.id} className="group flex items-center gap-3 py-0.5" data-testid="todo">
            <button
              type="button"
              role="checkbox"
              aria-checked={t.done}
              aria-label={t.text}
              onClick={() =>
                void invoke('newtab:todo', { action: 'toggle', id: t.id }).then(onChange)
              }
              className={`press grid size-[20px] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${
                t.done
                  ? 'border-[#0a84ff] bg-[#0a84ff] text-white'
                  : light
                    ? 'border-black/35 hover:border-black/60'
                    : 'border-white/55 hover:border-white/80'
              }`}
              data-testid="todo-check"
            >
              {t.done && <Check size={14} strokeWidth={3} />}
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-[16px] transition ${t.done ? 'line-through opacity-50' : ''}`}
            >
              {t.text}
              {t.note && (
                <span
                  className={`ml-2 text-[12.5px] ${t.overdue ? 'font-medium text-[#ff6b5e]' : 'opacity-55'}`}
                  data-testid="todo-note"
                >
                  {t.note}
                </span>
              )}
            </span>
            <button
              type="button"
              title="Remove from Today"
              aria-label={`Remove ${t.text} from Today`}
              onClick={() =>
                void invoke('newtab:todo', { action: 'remove', id: t.id }).then(onChange)
              }
              className="grid size-6 place-items-center rounded-full opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
              data-testid="todo-remove"
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-1 flex items-center gap-3 py-1">
        <Plus size={20} className="shrink-0 opacity-55" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={todos.length === 0 ? 'What’s on today?' : 'Add a task for today'}
          maxLength={200}
          className={`min-w-0 flex-1 bg-transparent text-[16px] outline-none ${
            light ? 'placeholder:text-neutral-500' : 'placeholder:text-white/50'
          }`}
          data-testid="todo-input"
        />
      </form>
    </section>
  );
}

function QuoteCard({ light }: { light: boolean }) {
  const [offset, setOffset] = useState(0);
  const quote = quoteFor(new Date(), offset);
  return (
    <button
      type="button"
      onClick={() => setOffset((n) => n + 1)}
      title="Another quote"
      className={`press w-[min(430px,100%)] rounded-[26px] px-7 pt-5 pb-5 text-left ${glass(light)}`}
      data-testid="quote"
    >
      <Quote size={30} className="fill-current opacity-90" strokeWidth={0} />
      <p key={offset} className="animate-row-in mt-2 text-[22px] leading-snug font-semibold italic">
        {quote.text}
      </p>
      {quote.by && <p className="mt-2 text-[14px] opacity-65">— {quote.by}</p>}
      <span className="mt-4 block h-1 w-20 rounded-full bg-[#f76b15]" />
    </button>
  );
}

function CustomizePanel({
  state,
  onChange,
  onClose,
}: {
  state: NewTabState;
  onChange: (state: NewTabState) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(state.name);
  const [tagline, setTagline] = useState(state.home.tagline);
  const current = state.wallpaper;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (wallpaper: WallpaperChoice) => {
    setError(null);
    void invoke('newtab:setWallpaper', { wallpaper }).then(onChange);
  };
  const chooseImage = () => {
    setError(null);
    invoke('newtab:chooseImage', {}).then(
      (next) => next && onChange(next),
      (e: unknown) => setError(messageOf(e).replace(/^.*\] /, '')),
    );
  };
  // Shown at once; main's answer follows.
  const show = (key: keyof NewTabState['home']['show'], on: boolean) => {
    onChange({ ...state, home: { ...state.home, show: { ...state.home.show, [key]: on } } });
    void invoke('newtab:setHome', { show: { [key]: on } }).then(onChange);
  };

  const isCurrent = (choice: WallpaperChoice) =>
    choice.kind === current.kind &&
    (choice.kind === 'custom' || (current.kind === 'builtin' && choice.id === current.id));
  const field =
    'h-9 w-full rounded-[11px] bg-white/10 px-3 text-[13.5px] outline-none ring-1 ring-white/10 placeholder:text-white/40 focus:ring-white/30';

  return (
    <section
      className="animate-pop absolute top-20 right-5 z-20 max-h-[calc(100%-6rem)] w-[340px] origin-top-right overflow-y-auto rounded-[22px] border border-white/15 bg-neutral-900/75 p-4 text-white shadow-2xl backdrop-blur-2xl"
      aria-label="Customize new tab"
      data-testid="customize-panel"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Customize</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1 opacity-70 hover:bg-white/10 hover:opacity-100"
        >
          <X size={15} />
        </button>
      </header>

      <PanelLabel>Your name</PanelLabel>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() =>
          name.trim() !== state.name &&
          void invoke('newtab:setName', { name: name.trim() }).then(onChange)
        }
        maxLength={40}
        placeholder="For the greeting"
        className={field}
        data-testid="customize-name"
      />
      <PanelLabel>Tagline</PanelLabel>
      <input
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
        onBlur={() =>
          tagline !== state.home.tagline &&
          void invoke('newtab:setHome', { tagline }).then(onChange)
        }
        maxLength={80}
        placeholder="Focus. Create. Build. Repeat."
        className={field}
        data-testid="customize-tagline"
      />

      <PanelLabel>Show</PanelLabel>
      <div className="flex flex-col gap-1">
        {(
          [
            ['shortcuts', 'Shortcuts'],
            ['today', 'My Focus list'],
            ['quote', 'Quote'],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex h-8 items-center justify-between rounded-[10px] px-1 text-[13.5px]"
          >
            {label}
            <input
              type="checkbox"
              checked={state.home.show[key]}
              onChange={(e) => show(key, e.target.checked)}
              className="size-4 accent-[#0a84ff]"
              data-testid={`show-${key}`}
            />
          </label>
        ))}
      </div>

      <PanelLabel>Wallpaper</PanelLabel>
      <div className="grid grid-cols-3 gap-2">
        {BUILTIN_WALLPAPERS.map(({ id, name: label }) => {
          const choice: WallpaperChoice = { kind: 'builtin', id };
          return (
            <Swatch
              key={id}
              label={label}
              background={WALLPAPER_CSS[id]}
              selected={isCurrent(choice)}
              onClick={() => pick(choice)}
              testId={`wallpaper-${id}`}
            />
          );
        })}
        {state.customImage && (
          <Swatch
            label="Your image"
            background={`center / cover url("${state.customImage}")`}
            selected={isCurrent({ kind: 'custom' })}
            onClick={() => pick({ kind: 'custom' })}
            testId="wallpaper-custom"
          />
        )}
      </div>

      <button
        type="button"
        onClick={chooseImage}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-2 text-[13px] font-medium hover:bg-white/15"
        data-testid="choose-image"
      >
        <ImagePlus size={15} />
        {state.customImage ? 'Choose another image…' : 'Choose your own image…'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-4 mb-1.5 text-[11.5px] font-semibold tracking-wide text-white/50 uppercase first-of-type:mt-0">
      {children}
    </h3>
  );
}

function Swatch(props: {
  label: string;
  background: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.selected}
      className={`group relative aspect-[16/10] overflow-hidden rounded-lg ring-2 transition ${
        props.selected ? 'ring-white' : 'ring-transparent hover:ring-white/40'
      }`}
      style={{ background: props.background }}
      data-testid={props.testId}
    >
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-3 pb-1 text-left text-[11px] font-medium">
        {props.label}
      </span>
      {props.selected && (
        <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-white text-neutral-900">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
