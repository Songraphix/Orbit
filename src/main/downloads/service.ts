import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { app, nativeImage, shell } from 'electron';
import type { DownloadItem, NativeImage, Session, WebContents } from 'electron';
import type { DownloadView, DownloadsSnapshot, RecentDownload } from '@shared/types/downloads';
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

/** A download as stored, for Library → Downloads and Media. */
export type DownloadRecord = {
  id: string;
  url: string;
  path: string;
  filename: string;
  mime: string;
  totalBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  startedAt: number;
  finishedAt: number | null;
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
    const d = this.find(id);
    if (d?.state === 'completed' && existsSync(d.path)) void shell.openPath(d.path);
  }

  reveal(id: string): void {
    const d = this.find(id);
    if (d && existsSync(d.path)) shell.showItemInFolder(d.path);
  }

  /** Every download, newest first, including earlier sessions' (Library → Downloads). */
  history(query = '', limit = 500): DownloadRecord[] {
    const like = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = this.db
      .prepare(
        `SELECT id, url, path, filename, mime, total_bytes, state, started_at, finished_at
         FROM downloads WHERE filename LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\'
         ORDER BY started_at DESC LIMIT ?`,
      )
      .all(like, like, limit) as {
      id: string;
      url: string;
      path: string | null;
      filename: string;
      mime: string | null;
      total_bytes: number | null;
      state: DownloadRecord['state'];
      started_at: number;
      finished_at: number | null;
    }[];
    return rows.map((row) => {
      const live = this.items.get(row.id); // this session's: current state and progress
      return {
        id: row.id,
        url: row.url,
        path: row.path ?? '',
        filename: row.filename,
        mime: row.mime ?? '',
        totalBytes: live?.totalBytes ?? row.total_bytes ?? 0,
        state: live?.state ?? row.state,
        startedAt: row.started_at,
        finishedAt: live?.finishedAt ?? row.finished_at,
      };
    });
  }

  /** The latest finished downloads still on disk, with previews (the Library button's hover). */
  async recent(limit = 6): Promise<RecentDownload[]> {
    const rows = this.history('', 60)
      .filter((d) => d.state === 'completed' && d.path && existsSync(d.path))
      .slice(0, limit);
    return Promise.all(
      rows.map(async (d) => ({
        id: d.id,
        filename: d.filename,
        finishedAt: d.finishedAt ?? d.startedAt,
        thumbnail: await this.previewFor(d.path),
      })),
    );
  }

  private readonly previews = new Map<string, string | null>();

  private async previewFor(path: string): Promise<string | null> {
    if (this.previews.has(path)) return this.previews.get(path) ?? null;
    let preview: string | null = null;
    try {
      const image = IMAGE.test(path)
        ? await nativeImage.createThumbnailFromPath(path, { width: 64, height: 64 })
        : await app.getFileIcon(path, { size: 'normal' });
      preview = image.isEmpty() ? null : image.toDataURL();
    } catch {
      // A generic file icon is shown instead.
    }
    this.previews.set(path, preview);
    return preview;
  }

  private find(id: string): { path: string; state: DownloadRecord['state'] } | null {
    const live = this.items.get(id);
    if (live) return live;
    const row = this.db.prepare('SELECT path, state FROM downloads WHERE id = ?').get(id) as
      { path: string | null; state: DownloadRecord['state'] } | undefined;
    return row?.path ? { path: row.path, state: row.state } : null;
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
    const d = this.find(id); // this session's, or an earlier one's (recent files)
    if (!d || d.state !== 'completed' || !existsSync(d.path)) return;
    const thumbnail = this.items.get(id)?.thumbnail ?? (await this.previewFor(d.path));
    const icon: NativeImage = thumbnail
      ? nativeImage.createFromDataURL(thumbnail)
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
