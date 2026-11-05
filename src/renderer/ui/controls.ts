/**
 * Orbit's text fields and dropdowns (design system, M1): the same height, radius, border and
 * focus ring as buttons, in light and dark (`.ui-light` surfaces).
 */
export const FIELD =
  'h-8 rounded-[var(--radius-control)] border border-neutral-200 bg-white px-2.5 text-[13px] text-neutral-800 shadow-[0_1px_1px_rgb(0_0_0/0.03)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent-fill)] focus:ring-2 focus:ring-[var(--accent-fill)]/20 disabled:opacity-40';

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-fill,#2f7d75)] text-on-accent shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:brightness-110',
  secondary:
    'border border-neutral-200 bg-white text-neutral-800 shadow-[0_1px_1px_rgb(0_0_0/0.04)] hover:bg-neutral-50',
  ghost: 'text-neutral-700 hover:bg-black/[0.05]',
  danger:
    'border border-neutral-200 bg-white text-[#d70015] hover:bg-[rgb(255_59_48/0.08)] dark:text-[#ff6961]',
};

/** The classes of a button, for elements that can't be a <Button> (links, labels, submit). */
export function buttonClass(variant: Variant = 'secondary', size: 'sm' | 'md' = 'md'): string {
  return `press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,filter] disabled:pointer-events-none disabled:opacity-40 ${
    size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]'
  } ${VARIANTS[variant]}`;
}
