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

/** Library → Downloads' Filter (like Arc's): what a kind of file counts as. */
export const DOWNLOAD_FILTERS = [
  { id: 'all', label: 'All Files' },
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
  { id: 'documents', label: 'Documents' },
  { id: 'installers', label: 'Disk Images & Installers' },
  { id: 'archives', label: 'Archives' },
  { id: 'other', label: 'Other' },
] as const;
export type DownloadFilter = (typeof DOWNLOAD_FILTERS)[number]['id'];

/** A file's filter from its kind label ("Image", "PDF", "Disk Image"…). Pure. */
export function downloadCategory(kind: string): Exclude<DownloadFilter, 'all'> {
  switch (kind) {
    case 'Image':
      return 'images';
    case 'Video':
      return 'videos';
    case 'Audio':
      return 'audio';
    case 'PDF':
    case 'Document':
    case 'Spreadsheet':
    case 'Presentation':
      return 'documents';
    case 'Disk Image':
    case 'Installer':
      return 'installers';
    case 'Archive':
      return 'archives';
    default:
      return 'other';
  }
}

/** Arc's second line: "Disk Image from wavebox.app" (or just the kind). Pure. */
export function downloadSubtitle(kind: string, url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  return host ? `${kind} from ${host}` : kind;
}
