import { LayoutGrid, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import type { NewTabState } from '@shared/types/newtab';
import type { Shortcut } from '@shared/types/home';

const invoke = window.orbit.invoke;

/** Main's error text without Electron's "Error invoking remote method…" prefix. */
const messageOf = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^Error: /, '');

/** An icon's resting size, and how much it grows right under the pointer (like macOS). */
const ICON = 46;
/** Gentle on purpose (UI spec §9: no exaggerated Dock magnification). */
const GROW = 0.12;
/** How far (px) from the pointer icons still grow a little. */
const REACH = 120;

const LETTER_COLORS = ['#4f8f86', '#5a87a6', '#9c8a6b', '#6d7f8c', '#7a6f99', '#5f8a6a'];

const reducedMotion = () =>
  document.documentElement.classList.contains('motion-reduced') ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The Homepage's Dock (owner request): your shortcuts as a Mac-style Dock along the bottom —
 * glass shelf, app-like tiles that grow under the pointer, the name above the one you point at,
 * and + after a divider to add one.
 */
export function Dock(props: {
  shortcuts: Shortcut[];
  light: boolean;
  glass: string;
  onChange: (s: NewTabState) => void;
}) {
  const { shortcuts, light } = props;
  const [adding, setAdding] = useState(false);
  /** Each icon's size, from its distance to the pointer (empty: all at rest). */
  const [sizes, setSizes] = useState<number[]>([]);
  const items = useRef<(HTMLElement | null)[]>([]);
  const count = shortcuts.length + (shortcuts.length < 10 ? 1 : 0);
  const sizeOf = (index: number): number => sizes[index] ?? ICON;

  const track = (x: number | null) => {
    if (x === null || reducedMotion()) {
      setSizes([]);
      return;
    }
    setSizes(
      Array.from({ length: count }, (_, i) => {
        const el = items.current[i];
        if (!el) return ICON;
        const box = el.getBoundingClientRect();
        const near = Math.max(0, 1 - Math.abs(x - (box.left + box.width / 2)) / REACH);
        return Math.round(ICON * (1 + GROW * near * near));
      }),
    );
  };

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-3 z-10 flex justify-center"
      aria-label="Shortcuts"
    >
      <ul
        // The shelf keeps its height; growing icons rise out of it, as on a Mac.
        className={`pointer-events-auto flex items-end gap-2 overflow-visible rounded-[22px] px-2.5 pb-2 ${props.glass}`}
        style={{ height: ICON + 16 }}
        onMouseMove={(e) => track(e.clientX)}
        onMouseLeave={() => track(null)}
        data-testid="shortcuts"
      >
        <li className="group relative flex flex-col items-center">
          <button
            type="button"
            onClick={() => void invoke('applib:open', {})}
            aria-label="App Library"
            title="App Library (⇧⌘A)"
            className={`press lift grid place-items-center rounded-[14px] ${
              light ? 'bg-black/[0.07]' : 'bg-white/[0.14]'
            }`}
            style={{ width: ICON, height: ICON }}
            data-testid="dock-launcher"
          >
            <LayoutGrid size={20} strokeWidth={2} className="opacity-90" />
          </button>
        </li>
        {shortcuts.map((s, i) => {
          const size = sizeOf(i);
          return (
            <li
              key={s.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              className="group relative flex flex-col items-center"
            >
              <span
                className={`pointer-events-none absolute bottom-full mb-2 rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${
                  light ? 'bg-white/90 text-neutral-900' : 'bg-neutral-900/85 text-white'
                }`}
                style={{ marginBottom: size - ICON + 8 }}
                data-testid="shortcut-name"
              >
                {s.title}
              </span>
              <button
                type="button"
                onClick={() => void invoke('newtab:navigate', { input: s.url })}
                className="press block transition-[width,height] duration-100 ease-out"
                style={{ width: size, height: size }}
                aria-label={s.title}
                title={s.url}
                data-testid="shortcut"
              >
                <DockIcon shortcut={s} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${s.title}`}
                onClick={() =>
                  void invoke('newtab:shortcut', { action: 'remove', id: s.id }).then(
                    props.onChange,
                  )
                }
                className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-neutral-900/85 text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-neutral-900"
                data-testid="shortcut-remove"
              >
                <X size={11} strokeWidth={2.75} />
              </button>
            </li>
          );
        })}
        {shortcuts.length < 10 && (
          <>
            {shortcuts.length > 0 && (
              <li
                aria-hidden
                className={`mx-0.5 w-px self-stretch ${light ? 'bg-black/15' : 'bg-white/20'}`}
              />
            )}
            <li
              ref={(el) => {
                items.current[count - 1] = el;
              }}
              className="group relative flex flex-col items-center"
            >
              <span
                className={`pointer-events-none absolute bottom-full mb-2 rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${
                  light ? 'bg-white/90 text-neutral-900' : 'bg-neutral-900/85 text-white'
                }`}
                style={{ marginBottom: sizeOf(count - 1) - ICON + 8 }}
              >
                Add Shortcut
              </span>
              <button
                type="button"
                onClick={() => setAdding((open) => !open)}
                aria-label="Add Shortcut"
                className={`press grid place-items-center rounded-[12px] transition-[width,height] duration-100 ease-out ${
                  light ? 'bg-black/[0.07]' : 'bg-white/[0.12]'
                }`}
                style={{ width: sizeOf(count - 1), height: sizeOf(count - 1) }}
                data-testid="shortcut-add"
              >
                <Plus size={20} strokeWidth={2} className="opacity-85" />
              </button>
              {adding && (
                <AddShortcut
                  light={light}
                  glass={props.glass}
                  onClose={() => setAdding(false)}
                  onChange={props.onChange}
                />
              )}
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}

/** A shortcut as an app-like tile: its site's icon on white, or a coloured letter. */
function DockIcon({ shortcut }: { shortcut: Shortcut }) {
  const tile: CSSProperties = { borderRadius: '23%' };
  if (shortcut.icon) {
    return (
      <span
        className="grid size-full place-items-center bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
        style={tile}
      >
        <img src={shortcut.icon} alt="" className="size-[62%] object-contain" />
      </span>
    );
  }
  const letter = shortcut.title.charAt(0).toUpperCase() || '?';
  const color = LETTER_COLORS[letter.charCodeAt(0) % LETTER_COLORS.length];
  return (
    <span
      className="grid size-full place-items-center text-[18px] font-bold text-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
      style={{ ...tile, background: color }}
    >
      {letter}
    </span>
  );
}

function AddShortcut(props: {
  light: boolean;
  glass: string;
  onClose: () => void;
  onChange: (s: NewTabState) => void;
}) {
  const { light } = props;
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
        props.onChange(next);
        props.onClose();
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
      onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
      className={`animate-pop absolute right-0 bottom-full z-20 mb-4 w-64 rounded-[18px] p-3 text-left ${props.glass}`}
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
          onClick={props.onClose}
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
