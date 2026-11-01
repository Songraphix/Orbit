/** "just now", "27 minutes ago", "2 hours ago", "yesterday", "3 days ago" (Img 7). Pure. */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

/** "Today", "Yesterday", or "Monday 27 October" — list headings (Archived Tabs, Downloads). */
export function dayLabel(then: number, now: number): string {
  const day = new Date(then);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Groups items under day headings, newest day first (items arrive newest first). */
export function groupByDay<T>(items: readonly T[], at: (item: T) => number, now: number) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = dayLabel(at(item), now);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups];
}
