import { Check, Ellipsis, Folder } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { colorHex } from '@shared/work';

/** A project's folder in its colour. */
export function FolderIcon({ color, size = 40 }: { color: string; size?: number }) {
  const hex = colorHex(color);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[12px]"
      style={{ width: size, height: size, background: `${hex}26` }}
      aria-hidden
    >
      <Folder size={size * 0.55} fill={hex} stroke={hex} strokeWidth={1.5} />
    </span>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--work-track)]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${percent}%`, background: colorHex(color) }}
      />
    </div>
  );
}

/** Filter pills with counts (All 6 · Active 3 …). */
export function FilterPills<T extends string>(props: {
  value: T;
  options: readonly { id: T; label: string; count: number }[];
  onChange: (id: T) => void;
  testId: string;
}) {
  return (
    <div
      className="flex gap-1 scrollbar-none overflow-x-auto"
      role="tablist"
      data-testid={props.testId}
    >
      {props.options.map((o) => {
        const on = o.id === props.value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => props.onChange(o.id)}
            className={`press flex h-[30px] shrink-0 items-center gap-1 rounded-full px-[9px] text-[12.5px] font-medium ${
              on
                ? 'bg-[var(--work-accent)] text-white'
                : 'bg-[var(--work-card)] text-[var(--note-muted)] ring-1 ring-[var(--work-border)] hover:text-[var(--note-fg)]'
            }`}
            data-filter={o.id}
          >
            {o.label}
            <span className={`tabular-nums ${on ? 'opacity-85' : 'opacity-70'}`}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export type MenuItem =
  | { label: string; onSelect: () => void; danger?: boolean; checked?: boolean; testId?: string }
  | { divider: true };

/** A ⋯ button with a small menu (closes on a pick, a click outside, or Esc). */
export function MoreMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="press grid size-7 place-items-center rounded-[9px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
        data-testid="more-menu"
      >
        <Ellipsis size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute top-full right-0 z-30 mt-1 w-48 origin-top-right rounded-[14px] bg-[var(--work-sheet)] p-1 text-[13px] shadow-[0_12px_32px_-8px_rgb(0_0_0/0.45)] ring-1 ring-[var(--work-border)]"
        >
          {items.map((item, i) =>
            'divider' in item ? (
              <div key={i} className="mx-2 my-1 h-px bg-[var(--work-border)]" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex h-8 w-full items-center gap-2 rounded-[9px] px-2.5 text-left hover:bg-[var(--note-hover)] ${
                  item.danger ? 'text-[#ef4444]' : ''
                }`}
                data-testid={item.testId}
              >
                <span className="w-3.5">{item.checked && <Check size={13} />}</span>
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** A friendly empty state with an action. */
export function Empty(props: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void; testId?: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" data-testid="empty">
      <span className="mb-1 text-[var(--work-accent-text)]">{props.icon}</span>
      <span className="text-[14px] font-semibold">{props.title}</span>
      {props.hint && <span className="text-[12.5px] text-[var(--note-muted)]">{props.hint}</span>}
      {props.action && (
        <button
          type="button"
          onClick={props.action.onClick}
          className="press mt-2 rounded-full bg-[var(--work-accent)] px-4 py-1.5 text-[13px] font-semibold text-white"
          data-testid={props.action.testId}
        >
          {props.action.label}
        </button>
      )}
    </div>
  );
}

/** A section title in the panel (Projects, Tasks…) with its main button. */
export function ViewHeader(props: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-3">
      <h1 className="text-[20px] font-bold tracking-[-0.01em]">{props.title}</h1>
      {props.action}
    </div>
  );
}

export function PrimaryButton(props: {
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`press flex items-center gap-1.5 rounded-[11px] bg-[var(--work-accent)] font-semibold text-white shadow-[0_6px_16px_-6px_var(--work-accent)] hover:brightness-110 ${
        props.small ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
