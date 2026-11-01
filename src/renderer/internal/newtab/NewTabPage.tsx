import { Check, ImagePlus, Paintbrush, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BUILTIN_WALLPAPERS } from '@shared/types/newtab';
import type { NewTabState, WallpaperChoice } from '@shared/types/newtab';
import { GRAIN, WALLPAPER_CSS } from './wallpapers';

/** orbit://newtab — wallpaper, clock and greeting, and a search box (user request, 2026-11-01). */
export function NewTabPage() {
  const [state, setState] = useState<NewTabState | null>(null);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    void window.orbit.invoke('newtab:get', {}).then(setState);
  }, []);

  return (
    <main className="relative h-full overflow-hidden text-white" data-testid="newtab">
      <Wallpaper state={state} />
      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-6 pb-[8vh]">
        <Clock />
        <SearchBox />
      </div>
      <button
        type="button"
        className="absolute right-5 bottom-5 flex items-center gap-2 rounded-full bg-black/25 px-3.5 py-2 text-[13px] font-medium backdrop-blur-md transition hover:bg-black/40"
        onClick={() => setCustomizing((open) => !open)}
        aria-expanded={customizing}
        data-testid="customize-button"
      >
        <Paintbrush size={14} />
        Customize
      </button>
      {customizing && state && (
        <CustomizePanel state={state} onChange={setState} onClose={() => setCustomizing(false)} />
      )}
    </main>
  );
}

function Wallpaper({ state }: { state: NewTabState | null }) {
  const choice = state?.wallpaper;
  const background =
    choice?.kind === 'custom' && state?.customImage
      ? `center / cover no-repeat url("${state.customImage}")`
      : WALLPAPER_CSS[choice?.kind === 'builtin' ? choice.id : 'aurora'];

  return (
    <div
      className="absolute inset-0 transition-[background] duration-500"
      style={{ background }}
      data-testid="wallpaper"
      data-wallpaper={choice ? (choice.kind === 'custom' ? 'custom' : choice.id) : 'loading'}
    >
      {/* Grain plus a soft vignette keeps white text readable on any wallpaper. */}
      <div
        className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
        style={{ background: GRAIN }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.35)_100%)]" />
    </div>
  );
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

function Clock() {
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

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="text-center [text-shadow:0_2px_24px_rgb(0_0_0/0.25)]">
      <div
        className="text-[clamp(56px,11vw,128px)] leading-none font-extralight tracking-tight tabular-nums"
        data-testid="clock"
      >
        {time}
      </div>
      <div className="mt-3 text-lg font-medium opacity-90">
        {greeting(now.getHours())} · <span className="opacity-80">{date}</span>
      </div>
    </div>
  );
}

function SearchBox() {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // The tab gets focus when it opens; put the caret straight into the box.
  useEffect(() => input.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = value.trim();
    if (query) void window.orbit.invoke('newtab:navigate', { input: query });
  };

  return (
    <form onSubmit={submit} className="w-full max-w-xl" role="search">
      <label className="flex h-14 items-center gap-3 rounded-2xl border border-white/20 bg-white/15 px-5 shadow-[0_8px_40px_rgb(0_0_0/0.25)] backdrop-blur-xl transition focus-within:border-white/40 focus-within:bg-white/20">
        <Search size={20} className="shrink-0 opacity-80" />
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search Google or enter an address"
          aria-label="Search or enter an address"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-white/65"
          spellCheck={false}
          autoComplete="off"
          data-testid="newtab-search"
        />
      </label>
    </form>
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
  const current = state.wallpaper;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (wallpaper: WallpaperChoice) => {
    setError(null);
    void window.orbit.invoke('newtab:setWallpaper', { wallpaper }).then(onChange);
  };
  const chooseImage = () => {
    setError(null);
    window.orbit.invoke('newtab:chooseImage', {}).then(
      (next) => next && onChange(next),
      (e: Error) => setError(e.message.replace(/^.*\] /, '').replace(/^Error invoking.*?: /, '')),
    );
  };

  const isCurrent = (choice: WallpaperChoice) =>
    choice.kind === current.kind &&
    (choice.kind === 'custom' || (current.kind === 'builtin' && choice.id === current.id));

  return (
    <section
      className="absolute right-5 bottom-16 w-[340px] rounded-2xl border border-white/15 bg-neutral-900/70 p-4 text-white shadow-2xl backdrop-blur-2xl"
      aria-label="Customize new tab"
      data-testid="customize-panel"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Wallpaper</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 opacity-70 hover:bg-white/10 hover:opacity-100"
        >
          <X size={14} />
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {BUILTIN_WALLPAPERS.map(({ id, name }) => {
          const choice: WallpaperChoice = { kind: 'builtin', id };
          return (
            <Swatch
              key={id}
              label={name}
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
