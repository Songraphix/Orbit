import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeImage, shell } from 'electron';
import type { MediaItem } from '@shared/types/library';
import type { DownloadService } from '../downloads/service';
import { captureFileName, isSafeFileName, mediaKind } from './model';

const THUMBNAIL = { width: 320, height: 320 };

/**
 * Library → Media (F-11): images and videos from downloads, plus screenshots saved from site
 * controls. Thumbnails are made by macOS (Quick Look) and cached as data: URLs, so the Library
 * page never loads files from disk itself.
 */
export class MediaLibrary {
  private readonly thumbnails = new Map<string, string | null>();

  constructor(
    private readonly capturesDir: string,
    private readonly downloads: DownloadService,
  ) {}

  /** Saves a screenshot; returns its path. */
  saveCapture(png: Buffer, now = new Date()): string {
    mkdirSync(this.capturesDir, { recursive: true });
    let name = captureFileName(now);
    for (let n = 2; existsSync(join(this.capturesDir, name)); n++) {
      name = captureFileName(now).replace(/\.png$/, ` ${n}.png`);
    }
    const path = join(this.capturesDir, name);
    writeFileSync(path, png);
    return path;
  }

  async list(limit = 200): Promise<MediaItem[]> {
    const items: (MediaItem & { path: string })[] = [];
    for (const d of this.downloads.history('', 1000)) {
      const kind = mediaKind(d.filename, d.mime);
      if (!kind || d.state !== 'completed' || !d.path || !existsSync(d.path)) continue;
      items.push({
        id: `download:${d.id}`,
        name: d.filename,
        kind,
        source: 'download',
        createdAt: d.finishedAt ?? d.startedAt,
        thumbnail: null,
        path: d.path,
      });
    }
    for (const name of this.captureNames()) {
      const path = join(this.capturesDir, name);
      items.push({
        id: `capture:${name}`,
        name,
        kind: 'image',
        source: 'capture',
        createdAt: statSync(path).mtimeMs,
        thumbnail: null,
        path,
      });
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    const shown = items.slice(0, limit);
    await Promise.all(
      shown.map(async (item) => (item.thumbnail = await this.thumbnail(item.path))),
    );
    return shown.map(({ path: _path, ...item }) => item);
  }

  open(id: string, action: 'open' | 'reveal'): void {
    const path = this.pathFor(id);
    if (!path || !existsSync(path)) return;
    if (action === 'open') void shell.openPath(path);
    else shell.showItemInFolder(path);
  }

  private pathFor(id: string): string | null {
    const [source, rest = ''] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (source === 'capture') return isSafeFileName(rest) ? join(this.capturesDir, rest) : null;
    if (source === 'download') {
      const d = this.downloads.history('', 1000).find((x) => x.id === rest);
      return d?.path && mediaKind(d.filename, d.mime) ? d.path : null;
    }
    return null;
  }

  private captureNames(): string[] {
    if (!existsSync(this.capturesDir)) return [];
    return readdirSync(this.capturesDir).filter(
      (name) => isSafeFileName(name) && mediaKind(name) === 'image',
    );
  }

  private async thumbnail(path: string): Promise<string | null> {
    if (this.thumbnails.has(path)) return this.thumbnails.get(path) ?? null;
    let dataUrl: string | null = null;
    try {
      const image = await nativeImage.createThumbnailFromPath(path, THUMBNAIL);
      // JPEG keeps a page of 200 thumbnails to a few MB over IPC.
      dataUrl = image.isEmpty()
        ? null
        : `data:image/jpeg;base64,${image.toJPEG(75).toString('base64')}`;
    } catch {
      // No preview (unsupported file): the page shows a generic tile.
    }
    this.thumbnails.set(path, dataUrl);
    return dataUrl;
  }
}
