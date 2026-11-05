import {
  ArrowUpRight,
  Check,
  Crosshair,
  LayoutGrid,
  Mic,
  Plus,
  Quote,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { looksLikeQuestion } from '@shared/voice';
import { greetingFor } from '@shared/profile';
import { quoteFor } from '@shared/quotes';
import type { NewTabState, WallpaperChoice } from '@shared/types/newtab';
import { BackgroundSection, UnsplashCredit, Wallpaper } from './backgrounds';
import { DEFAULT_LOOK } from '@shared/backgrounds';
import type { BackgroundLook } from '@shared/backgrounds';
import { WidgetGrid } from './widgets';
import { Dock } from './Dock';
import { HomeMenu } from './HomeMenu';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';
import { DEFAULT_LAYOUT, newWidget } from '@shared/home-widgets';
import type { HomeLayout } from '@shared/home-widgets';
import type { CanvasFrame } from '@shared/types/canvas';
import { useCanvas } from '../../ui/canvas-store';

const invoke = window.orbit.invoke;

/** Where this page sits in its window (main says when it moves), so the wallpaper lines up
 *  with the canvas the shell paints around it (UI spec §9): one surface, no seam. */
function useCanvasFrame(): CanvasFrame | null {
  const [frame, setFrame] = useState<CanvasFrame | null>(null);
  useEffect(() => {
    const off = window.orbit.on('canvas:frame', setFrame);
    void invoke('canvas:place', {}).then((f) => setFrame((current) => current ?? f));
    return off;
  }, []);
  return frame;
}

/**
 * orbit://newtab (owner request, 2026-11-01): the time, a greeting by name, your tagline, a
 * search box, shortcuts to your sites, today's to-dos and a quote, over a wallpaper. Dark or
 * light glass; everything can be switched off in Customise.
 */
export function NewTabPage() {
  const [state, setState] = useState<NewTabState | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  // A background being previewed (Apply keeps it), and adjustments as you drag.
  const [preview, setPreview] = useState<WallpaperChoice | null>(null);
  const [lookPreview, setLookPreview] = useState<BackgroundLook | null>(null);
  const frame = useCanvasFrame();
  const shownChoice = preview ?? state?.shown ?? null;
  // With several widgets the top steps back so they fit (UI REFERENCE S3).
  const compact = (state?.layout.widgets.length ?? 0) >= 4;
  // The widgets' layout: shown at once, then main's answer.
  const setLayout = (layout: HomeLayout) => {
    setState((s) => (s ? { ...s, layout } : s));
    void invoke('newtab:setLayout', { layout }).then(setState);
  };

  useEffect(() => {
    void invoke('newtab:get', {}).then(setState);
  }, []);

  // The glass follows the wallpaper (UI spec §4): light glass and dark text on a light one.
  const canvas = useCanvas();
  const light = canvas ? canvas.tone === 'light' : state?.home.theme === 'light';
  return (
    <main
      className={`relative h-full overflow-y-auto ${light ? 'text-neutral-900' : 'text-white'}`}
      data-theme={light ? 'light' : 'dark'}
      onContextMenu={(e) => {
        // Text fields keep their own menu; anywhere else, the Homepage's.
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, [contenteditable="true"]')) return;
        e.preventDefault();
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}
      data-testid="newtab"
    >
      <Wallpaper
        choice={preview ?? state?.shown ?? null}
        customImage={state?.customImage ?? null}
        frame={frame}
        look={lookPreview ?? state?.look ?? DEFAULT_LOOK}
        light={light}
      />
      {shownChoice?.kind === 'unsplash' && <UnsplashCredit photo={shownChoice.photo} />}
      <div
        className="mat-light absolute top-4 right-4 z-10 flex gap-0.5 rounded-full p-1"
        data-testid="home-controls"
      >
        <CornerButton
          label="Customize"
          light={light}
          onClick={() => setCustomizing((open) => !open)}
          expanded={customizing}
          testId="customize-button"
        >
          <LayoutGrid size={16} />
        </CornerButton>
      </div>

      {state && (
        <div
          className={`relative flex min-h-full flex-col px-8 ${
            state.home.show.shortcuts ? 'pb-32' : 'pb-6'
          } ${compact ? 'pt-[3vh]' : 'pt-[6vh]'}`}
        >
          <section className="flex flex-col items-center text-center">
            <Clock compact={compact} />
            <Greeting name={state.name} onChange={setState} />
            {state.home.tagline && (
              <p className="mt-1.5 text-[17px] opacity-80" data-testid="tagline">
                {state.home.tagline}
              </p>
            )}
            <SearchBox light={light} ai={state.ai} />
          </section>
          <div className="min-h-8 flex-1" />
          <WidgetGrid
            layout={state.layout}
            light={light}
            glass={glass(light)}
            editing={editing}
            onEditing={setEditing}
            onLayout={setLayout}
            scope={state.layoutScope}
            spaceName={state.spaceName}
            onScope={(scope) => void invoke('newtab:layoutScope', { scope }).then(setState)}
            builtin={(type) =>
              type === 'today' ? (
                <Today todos={state.todos} light={light} onChange={setState} />
              ) : (
                <QuoteCard />
              )
            }
          />
        </div>
      )}

      {state?.home.show.shortcuts && (
        <Dock shortcuts={state.shortcuts} light={light} glass="mat-light" onChange={setState} />
      )}

      {menuAt && state && (
        <HomeMenu
          at={menuAt}
          onClose={() => setMenuAt(null)}
          onPick={(action) => {
            if (action === 'customize' || action === 'background') setCustomizing(true);
            if (action === 'widgets') setEditing(true);
            if (action === 'reset') setLayout(DEFAULT_LAYOUT);
            if (action === 'shuffle') {
              // A different background at once: one of your favourites, else a built-in.
              const pool: WallpaperChoice[] = state.favorites.length
                ? state.favorites
                : BUILTIN_WALLPAPERS.map((w) => ({ kind: 'builtin' as const, id: w.id }));
              const others = pool.filter(
                (c) => JSON.stringify(c) !== JSON.stringify(state.wallpaper),
              );
              const next = others[Math.floor(Math.random() * others.length)] ?? pool[0];
              if (next) void invoke('newtab:setWallpaper', { wallpaper: next }).then(setState);
            }
          }}
        />
      )}
      {customizing && state && (
        <CustomizePanel
          state={state}
          onChange={setState}
          onLayout={setLayout}
          onEditWidgets={() => {
            setCustomizing(false);
            setEditing(true);
          }}
          onClose={() => {
            setCustomizing(false);
            setPreview(null); // closing without Apply goes back
          }}
          preview={preview}
          onPreview={setPreview}
          look={lookPreview ?? state.look}
          onLook={setLookPreview}
        />
      )}
    </main>
  );
}

/** What widgets sit on: a content surface — nearly solid, for reading (the redesign's surface
 *  vocabulary; [data-theme] on the page picks light or dark). */
function glass(_light: boolean): string {
  return 'mat';
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
      className={`lift grid size-9 place-items-center rounded-full ${
        props.expanded
          ? 'surface-selected'
          : props.light
            ? 'hover:bg-white/60'
            : 'hover:bg-white/[0.12]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
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

function Clock({ compact = false }: { compact?: boolean }) {
  const now = useMinute();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className="[text-shadow:0_2px_24px_rgb(0_0_0/0.14)]">
      <div
        className={`${
          compact
            ? 'text-[clamp(48px,min(6vw,8vh),78px)]'
            : 'text-[clamp(60px,min(8vw,11vh),112px)]'
        } leading-none font-medium tracking-[-0.04em] tabular-nums transition-[font-size] duration-[var(--dur-layout)] ease-[var(--ease-out)]`}
        data-testid="clock"
      >
        {time}
      </div>
      <div className="mt-2 text-[16px] font-medium tracking-wide opacity-80">{date}</div>
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
    <div className="mt-[2.4vh] flex flex-col items-center">
      <h1
        className="text-[clamp(26px,3vw,40px)] font-medium tracking-[-0.02em] [text-shadow:0_2px_20px_rgb(0_0_0/0.16)]"
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

type Route = 'open' | 'search' | 'ask';
const ROUTE_LABEL: Record<Route, string> = {
  open: 'Open address',
  search: 'Search the web',
  ask: 'Ask Orbit',
};
/** "github.com", "localhost:5173", "https://…": what's typed is an address. */
const looksLikeAddress = (text: string) =>
  /^(https?:\/\/|localhost(:\d+)?(\/|$))/i.test(text) || /^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(text);

/**
 * The Homepage's command input ("Quietly Alive" redesign): one place to search the web, open an
 * address or ask Orbit AI — typed, or spoken with the microphone. As you type, the ways it can
 * go open beneath it; the likely one is first (questions go to Orbit AI). ⏎ takes the first,
 * ⌘⏎ the second, ↑↓ choose.
 */
function SearchBox({ light, ai }: { light: boolean; ai: boolean }) {
  const [value, setValue] = useState('');
  const [chosen, setChosen] = useState(0);
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

  const query = value.trim();
  const routes: Route[] = !query
    ? []
    : looksLikeAddress(query)
      ? ['open', 'search']
      : ai
        ? looksLikeQuestion(query)
          ? ['ask', 'search']
          : ['search', 'ask']
        : ['search'];
  const current = Math.min(chosen, Math.max(0, routes.length - 1));

  const go = (route: Route | undefined) => {
    if (!route || !query) return;
    if (route === 'ask') void invoke('newtab:ask', { text: query });
    else void invoke('newtab:navigate', { input: query });
    if (route === 'ask') setValue('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(routes[current]);
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      go(routes[1] ?? routes[0]);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (routes.length < 2) return;
      e.preventDefault();
      setChosen((i) => (i + (e.key === 'ArrowDown' ? 1 : routes.length - 1)) % routes.length);
    }
  };
  const lead = routes[current] ?? (ai ? 'ask' : 'search');

  return (
    <form onSubmit={submit} className="mt-[3.4vh] w-full max-w-[760px]" role="search">
      <label
        className={`mat flex h-[60px] items-center gap-3.5 rounded-full pr-2 pl-5 transition-[box-shadow] duration-[var(--dur-hover)] focus-within:shadow-[0_0_0_3px_var(--focus-ring),inset_0_1px_0_var(--glass-highlight)]`}
      >
        <span className="relative grid size-[22px] shrink-0 place-items-center" aria-hidden>
          <Search
            size={20}
            className={`absolute transition-[opacity,transform] duration-[var(--dur-hover)] ${lead === 'ask' ? 'scale-75 opacity-0' : 'opacity-100'}`}
          />
          <Sparkles
            size={21}
            className={`absolute text-[var(--canvas-accent-2,currentColor)] transition-[opacity,transform] duration-[var(--dur-hover)] ${lead === 'ask' ? 'opacity-100' : 'scale-75 opacity-0'}`}
          />
        </span>
        <input
          ref={input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setChosen(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            ai
              ? 'Ask Orbit anything, search the web, or use voice…'
              : 'Search the web, type an address, or use voice…'
          }
          aria-label={ai ? 'Ask Orbit, search, or enter an address' : 'Search or enter an address'}
          className="h-full min-w-0 flex-1 bg-transparent text-[16.5px] outline-none placeholder:text-[var(--fg-muted)]"
          spellCheck={false}
          autoComplete="off"
          data-testid="newtab-search"
        />
        {!query && (
          <span className="flex shrink-0 gap-1 text-[11px] font-medium opacity-60" aria-hidden>
            <kbd
              className={`rounded-[6px] px-1.5 py-0.5 ${light ? 'bg-black/[0.07]' : 'bg-white/15'}`}
            >
              ⌘
            </kbd>
            <kbd
              className={`rounded-[6px] px-1.5 py-0.5 ${light ? 'bg-black/[0.07]' : 'bg-white/15'}`}
            >
              K
            </kbd>
          </span>
        )}
        <button
          type="button"
          aria-label="Speak (⇧⌘Space)"
          title="Speak (⇧⌘Space)"
          onClick={() => void invoke('voice:toggle', {})}
          className="lift grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent-fill)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_18px_-6px_var(--accent-fill)] hover:brightness-110"
          data-testid="newtab-voice"
        >
          <Mic size={19} />
        </button>
      </label>
      {/* The ways this can go, opening out of the box as you type. */}
      <div className="expand mt-2" data-open={routes.length > 0} aria-hidden={routes.length === 0}>
        <div className="flex justify-center gap-1.5" role="listbox" aria-label="Go to">
          {routes.map((route, i) => (
            <button
              key={route}
              type="button"
              role="option"
              aria-selected={i === current}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(route)}
              className={`lift flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ${
                i === current ? 'mat-sel' : 'mat-light opacity-85'
              }`}
              data-testid="newtab-route"
              data-route={route}
              data-current={i === current}
            >
              {route === 'ask' ? (
                <Sparkles size={13} />
              ) : route === 'open' ? (
                <ArrowUpRight size={13} />
              ) : (
                <Search size={13} />
              )}
              {ROUTE_LABEL[route]}
              <span className="ml-0.5 text-[11px] opacity-55">{i === 0 ? '⏎' : '⌘⏎'}</span>
            </button>
          ))}
        </div>
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
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Today" data-testid="today">
      <h2 className="mb-2.5 flex items-center gap-2 text-[14.5px] font-semibold tracking-[-0.005em]">
        <Crosshair size={16} className="opacity-85" />
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
      <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
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

function QuoteCard() {
  const [offset, setOffset] = useState(0);
  const quote = quoteFor(new Date(), offset);
  return (
    <button
      type="button"
      onClick={() => setOffset((n) => n + 1)}
      title="Another quote"
      className="press flex h-full w-full flex-col overflow-hidden text-left"
      data-testid="quote"
    >
      <Quote size={30} className="fill-current opacity-90" strokeWidth={0} />
      <p key={offset} className="animate-row-in mt-2 text-[19px] leading-snug font-semibold italic">
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
  onLayout,
  onEditWidgets,
  onClose,
  preview,
  onPreview,
  look,
  onLook,
}: {
  state: NewTabState;
  onChange: (state: NewTabState) => void;
  onLayout: (layout: HomeLayout) => void;
  onEditWidgets: () => void;
  onClose: () => void;
  preview: WallpaperChoice | null;
  onPreview: (choice: WallpaperChoice | null) => void;
  look: BackgroundLook;
  onLook: (look: BackgroundLook) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(state.name);
  const [tagline, setTagline] = useState(state.home.tagline);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Shown at once; main's answer follows. Today and Quote are widgets (added or removed).
  const has = (type: 'today' | 'quote') => state.layout.widgets.some((w) => w.type === type);
  const show = (key: keyof NewTabState['home']['show'], on: boolean) => {
    if (key === 'shortcuts') {
      onChange({ ...state, home: { ...state.home, show: { ...state.home.show, [key]: on } } });
      void invoke('newtab:setHome', { show: { [key]: on } }).then(onChange);
      return;
    }
    const widgets = on
      ? [...state.layout.widgets, newWidget(key)]
      : state.layout.widgets.filter((w) => w.type !== key);
    onLayout({ widgets });
  };

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
            ['today', 'Today'],
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
              checked={key === 'shortcuts' ? state.home.show.shortcuts : has(key)}
              onChange={(e) => show(key, e.target.checked)}
              className="size-4 accent-[#0a84ff]"
              data-testid={`show-${key}`}
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={onEditWidgets}
        className="mt-2 h-9 w-full rounded-[11px] bg-white/10 text-[13.5px] font-medium hover:bg-white/15"
        data-testid="customize-edit-widgets"
      >
        Edit Widgets…
      </button>

      <PanelLabel>Background</PanelLabel>
      <BackgroundSection
        state={state}
        preview={preview}
        onPreview={onPreview}
        look={look}
        onLook={onLook}
        onChange={onChange}
        onError={setError}
      />
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
