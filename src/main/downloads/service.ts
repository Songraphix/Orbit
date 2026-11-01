import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { app, nativeImage, shell } from 'electron';
import type { DownloadItem, NativeImage, Session, WebContents } from 'electron';
import type { DownloadView, DownloadsSnapshot } from '@shared/types/downloads';
import type { Database } from '../persistence/db';
import { onShelf, uniquePath } from './model';

type Tracked = DownloadView & {
  url: string;
  path: string;
  profileId: string;
  mime: string;
  dismissed: boolean;
  item: DownloadItem | null;
};

const IMAGE = /\.(png|jpe?g|gif|webp|heic|tiff?|bmp|pdf)$/i;

/**
 * Downloads (PLAN.md section 4.3, F-10): installed on every profile session. Files go straight to
 * the downloads folder (no save dialog), progress is tracked, a thumbnail or file icon is made
 * when finished, and the shelf can open, reveal or drag the file into other apps.
 */
export class DownloadService {
  private readonly items = new Map<string, Tracked>();
  private readonly configured = new WeakSet<Session>();
  private throttle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: Database,
    private readonly dir: () => string,
    private readonly onChange: (snapshot: DownloadsSnapshot) => void,
  ) {}

  configure(session: Session, profileId: string): void {
    if (this.configured.has(session)) return;
    this.configured.add(session);
    session.on('will-download', (_event, item) => this.track(item, profileId));
  }

  snapshot(now = Date.now()): DownloadsSnapshot {
    const items = [...this.items.values()]
      .filter((d) => onShelf(d, now))
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(
        ({ id, filename, state, receivedBytes, totalBytes, startedAt, finishedAt, thumbnail }) => ({
          id,
          filename,
          state,
          receivedBytes,
          totalBytes,
          startedAt,
          finishedAt,
          thumbnail,
        }),
      );
    return { items };
  }

  open(id: string): void {
    const d = this.items.get(id);
    if (d?.state === 'completed' && existsSync(d.path)) void shell.openPath(d.path);
  }

  reveal(id: string): void {
    const d = this.items.get(id);
    if (d && existsSync(d.path)) shell.showItemInFolder(d.path);
  }

  cancel(id: string): void {
    this.items.get(id)?.item?.cancel();
  }

  dismiss(id: string): void {
    const d = this.items.get(id);
    if (!d) return;
    d.dismissed = true;
    this.db.prepare('UPDATE downloads SET dismissed = 1 WHERE id = ?').run(id);
    this.emit();
  }

  /** Drag a finished file out of the shelf into Finder, Mail, Slack… */
  async startDrag(id: string, from: WebContents): Promise<void> {
    const d = this.items.get(id);
    if (!d || d.state !== 'completed' || !existsSync(d.path)) return;
    const icon: NativeImage = d.thumbnail
      ? nativeImage.createFromDataURL(d.thumbnail)
      : await app.getFileIcon(d.path, { size: 'normal' });
    from.startDrag({ file: d.path, icon });
  }

  private track(item: DownloadItem, profileId: string): void {
    const dir = this.dir();
    mkdirSync(dir, { recursive: true });
    const path = uniquePath(dir, item.getFilename(), existsSync);
    item.setSavePath(path);
    const id = randomUUID();
    const d: Tracked = {
      id,
      url: item.getURL(),
      path,
      profileId,
      mime: item.getMimeType(),
      filename: path.split('/').pop() ?? item.getFilename(),
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
      finishedAt: null,
      thumbnail: null,
      dismissed: false,
      item,
    };
    this.items.set(id, d);
    this.save(d);
    this.emit();

    item.on('updated', (_e, state) => {
      d.receivedBytes = item.getReceivedBytes();
      d.totalBytes = item.getTotalBytes();
      if (state === 'interrupted') d.state = 'interrupted';
      this.emitSoon();
    });
    item.once('done', (_e, state) => {
      d.state = state;
      d.receivedBytes = item.getReceivedBytes();
      d.finishedAt = Date.now();
      d.item = null;
      this.save(d);
      this.emit();
      if (state === 'completed') void this.makeThumbnail(d);
    });
  }

  private async makeThumbnail(d: Tracked): Promise<void> {
    try {
      const image = IMAGE.test(d.path)
        ? await nativeImage.createThumbnailFromPath(d.path, { width: 64, height: 64 })
        : await app.getFileIcon(d.path, { size: 'normal' });
      if (!image.isEmpty()) {
        d.thumbnail = image.toDataURL();
        this.emit();
      }
    } catch {
      // No preview: the shelf shows a generic file icon.
    }
  }

  private save(d: Tracked): void {
    this.db
      .prepare(
        `INSERT INTO downloads (id, profile_id, url, path, filename, mime, total_bytes, state, started_at, finished_at, dismissed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET state = excluded.state, total_bytes = excluded.total_bytes,
           finished_at = excluded.finished_at`,
      )
      .run(
        d.id,
        d.profileId,
        d.url,
        d.path,
        d.filename,
        d.mime,
        d.totalBytes,
        d.state,
        d.startedAt,
        d.finishedAt,
        d.dismissed ? 1 : 0,
      );
  }

  /** Progress events arrive many times a second; the shelf updates at most ~4×/s. */
  private emitSoon(): void {
    if (this.throttle) return;
    this.throttle = setTimeout(() => {
      this.throttle = null;
      this.emit();
    }, 250);
  }

  private emit(): void {
    this.onChange(this.snapshot());
  }
}
