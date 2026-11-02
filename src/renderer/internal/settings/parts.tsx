import type { ReactNode } from 'react';

/* Settings' building blocks: a section (what the nav jumps to), a titled group of rows, and a
   row — a setting's name and hint, with its control beside them (or below on narrow pages). */

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 px-1 text-subheading text-neutral-500">{title}</h3>
      <div className="divide-y divide-neutral-100 rounded-[var(--radius-card)] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        {children}
      </div>
    </section>
  );
}

/** A page of Settings (its heading is what the nav jumps to), with a line saying what's in it. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 pb-10" data-settings-section={id}>
      <h2 className="text-title">{title}</h2>
      {description && (
        <p className="mt-1 text-label text-neutral-500" data-testid="settings-section-description">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

/** A setting: its name and hint, and its control — beside them, or below when the page is
 *  narrow (Settings beside the productivity panel). */
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-[180px] flex-[1_1_220px]">
        <div className="text-label">{label}</div>
        <div className="mt-0.5 text-meta text-neutral-500">{hint}</div>
      </div>
      <div className="max-w-full min-w-0 shrink-0">{children}</div>
    </div>
  );
}
