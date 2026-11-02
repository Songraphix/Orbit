import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

/** A titled group in a Toolkit section. */
export function Group(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-[11.5px] font-semibold tracking-wide text-[var(--note-muted)] uppercase">
          {props.title}
        </h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

/** Copies text, showing a tick for a moment. */
export function CopyButton(props: { text: string; label?: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="press flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[12px] text-[var(--note-muted)] hover:bg-[var(--note-hover)] hover:text-[var(--note-fg)]"
      onClick={() => {
        void navigator.clipboard.writeText(props.text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      aria-label={props.label ?? 'Copy'}
      title={props.label ?? 'Copy'}
      data-testid={props.testId}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {props.label && <span>{done ? 'Copied' : props.label}</span>}
    </button>
  );
}

export function SmallButton(props: {
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`press flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold disabled:opacity-40 ${
        props.primary
          ? 'bg-[var(--work-accent)] text-white shadow-[0_6px_14px_-8px_var(--work-accent)]'
          : 'border border-[var(--work-border)] bg-[var(--work-card)] hover:bg-[var(--note-hover)]'
      }`}
      data-testid={props.testId}
    >
      {props.children}
    </button>
  );
}
