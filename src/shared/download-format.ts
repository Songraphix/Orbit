/** Download sizes and times as Arc shows them ("176.8/320.7 MB · 14s"). Pure. */

const UNITS = [
  { size: 1024 ** 3, label: 'GB' },
  { size: 1024 ** 2, label: 'MB' },
  { size: 1024, label: 'KB' },
];

/** "176.8/320.7 MB" (both in the total's unit), or "12.4 MB" when the total isn't known. */
export function progressLabel(received: number, total: number): string {
  const ref = total > 0 ? total : received;
  const unit = UNITS.find((u) => ref >= u.size) ?? UNITS[2]!;
  const fmt = (n: number) => (n / unit.size).toFixed(unit.label === 'KB' ? 0 : 1);
  return total > 0
    ? `${fmt(received)}/${fmt(total)} ${unit.label}`
    : `${fmt(received)} ${unit.label}`;
}

/** "14s", "3m", "1h 5m" left at the current speed; null when it can't be told yet. */
export function timeLeftLabel(remaining: number, bytesPerSecond: number | null): string | null {
  if (!bytesPerSecond || bytesPerSecond < 1 || remaining <= 0) return null;
  const s = Math.ceil(remaining / bytesPerSecond);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
