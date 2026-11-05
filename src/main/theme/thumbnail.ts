import { nativeImage, net } from 'electron';
import type { Pixels } from './canvas-service';

/** Only Unsplash's image host is fetched (a photo's small thumbnail, already public). */
const ALLOWED_HOSTS = new Set(['images.unsplash.com']);
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A wallpaper's colours, read on this Mac: a 48-pixel-wide copy of the picture (a file, or an
 * Unsplash thumbnail). The picture itself goes nowhere. BGRA, as the Mac's bitmaps are.
 */
export async function readThumbnail(
  source: { file: string } | { url: string },
): Promise<Pixels | null> {
  let image: Electron.NativeImage;
  if ('file' in source) {
    if (!source.file) return null;
    image = nativeImage.createFromPath(source.file);
  } else {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
    const response = await net.fetch(url.href);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    image = nativeImage.createFromBuffer(bytes);
  }
  if (image.isEmpty()) return null;
  const small = image.resize({ width: 48, quality: 'good' });
  const { width, height } = small.getSize();
  return { data: new Uint8Array(small.toBitmap()), width, height, order: 'bgra' };
}
