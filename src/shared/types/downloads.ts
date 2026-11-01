import { z } from 'zod';

/** One download as the sidebar shelf shows it (F-10, Img 7). */
export const downloadViewSchema = z.object({
  id: z.string(),
  filename: z.string(),
  state: z.enum(['progressing', 'completed', 'cancelled', 'interrupted']),
  receivedBytes: z.number(),
  totalBytes: z.number(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  /** A small preview (image thumbnail or file-type icon) as a data: URL. */
  thumbnail: z.string().nullable(),
  /** Smoothed speed in bytes/s while downloading (for "14s" left), else null. */
  speed: z.number().nullable(),
});
export type DownloadView = z.output<typeof downloadViewSchema>;

/** A finished download in the Library button's hover list (Arc's recent files). */
export const recentDownloadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  finishedAt: z.number(),
  thumbnail: z.string().nullable(),
});
export type RecentDownload = z.output<typeof recentDownloadSchema>;

export const downloadsSnapshotSchema = z.object({ items: z.array(downloadViewSchema) });
export type DownloadsSnapshot = z.output<typeof downloadsSnapshotSchema>;
