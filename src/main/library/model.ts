/** Library logic with no Electron imports (F-11). */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|avif|bmp|tiff?|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;

/** Whether a file belongs in Library → Media, by MIME type or, failing that, extension. */
export function mediaKind(filename: string, mime = ''): 'image' | 'video' | null {
  if (mime.startsWith('image/') || IMAGE_EXT.test(filename)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXT.test(filename)) return 'video';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Screenshot 2026-11-01 at 09.05.03.png", like macOS (local time). */
export function captureFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  return `Screenshot ${day} at ${time}.png`;
}

/** A capture's file name as sent back by the Library page: a plain name, never a path. */
export function isSafeFileName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 200 &&
    !/[/\\\0]/.test(name) &&
    name !== '.' &&
    name !== '..' &&
    !name.startsWith('.')
  );
}

/** Arc's second line in Library → Downloads: "Image", "PDF", "Video"… */
export function fileKindLabel(filename: string, mime = ''): string {
  const kind = mediaKind(filename, mime);
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  const ext = /\.([a-z0-9]{1,8})$/i.exec(filename)?.[1]?.toLowerCase() ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'aac', 'flac'].includes(ext))
    return 'Audio';
  if (['zip', 'rar', '7z', 'gz', 'tar', 'tgz'].includes(ext)) return 'Archive';
  if (ext === 'dmg') return 'Disk Image';
  if (ext === 'pkg') return 'Installer';
  if (['doc', 'docx', 'pages', 'txt', 'rtf', 'md'].includes(ext)) return 'Document';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'Spreadsheet';
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'Presentation';
  return ext ? ext.toUpperCase() : 'File';
}

/** Moves the item at `index` one place up (-1) or down (+1); returns the id to insert before. */
export function reorderTarget(
  ids: readonly string[],
  id: string,
  direction: -1 | 1,
): { beforeId: string | null } | null {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  // Moving up: insert before the previous one. Moving down: before the one after the next.
  return { beforeId: direction === -1 ? ids[target]! : (ids[target + 1] ?? null) };
}
