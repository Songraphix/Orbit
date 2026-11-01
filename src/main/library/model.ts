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
