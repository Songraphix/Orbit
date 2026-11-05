import type { DriveFile } from '@shared/drive';
import { driveQuery, readPlan } from '@shared/drive';
import type { Fetch } from '../cloud/http';

/** Google Drive's REST API (v3), read-only. Tokens come from DriveService. */
export class DriveApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

const FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink,size)';
/** At most this much of a file's text is read (Orbit AI gets a clipped copy). */
export const MAX_TEXT = 200_000;

export class DriveApi {
  constructor(
    private readonly fetchImpl: Fetch,
    private readonly base = 'https://www.googleapis.com',
  ) {}

  private async get(token: string, path: string, timeoutMs = 15_000): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new DriveApiError(
        0,
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Google Drive didn’t answer in time'
          : 'Orbit couldn’t reach Google Drive',
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new DriveApiError(
        response.status,
        body?.error?.message ?? `Google Drive said ${response.status}`,
      );
    }
    return response;
  }

  /** Files whose name or text contains the words (newest first). */
  async search(token: string, words: string, limit = 10, timeoutMs?: number): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      q: driveQuery(words),
      pageSize: String(Math.min(50, limit)),
      fields: FIELDS,
      orderBy: words.trim() ? '' : 'modifiedTime desc',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      spaces: 'drive',
    });
    if (!params.get('orderBy')) params.delete('orderBy'); // fullText search can't be ordered
    const response = await this.get(token, `/drive/v3/files?${params}`, timeoutMs);
    const json = (await response.json()) as { files?: Record<string, unknown>[] };
    return (json.files ?? []).map((f) => ({
      id: String(f['id']),
      name: String(f['name'] ?? 'Untitled'),
      mimeType: String(f['mimeType'] ?? ''),
      modifiedTime: typeof f['modifiedTime'] === 'string' ? f['modifiedTime'] : null,
      webViewLink: typeof f['webViewLink'] === 'string' ? f['webViewLink'] : null,
      size: f['size'] ? Number(f['size']) : null,
    }));
  }

  async file(token: string, id: string): Promise<DriveFile> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,modifiedTime,webViewLink,size',
      supportsAllDrives: 'true',
    });
    const f = (await (
      await this.get(token, `/drive/v3/files/${encodeURIComponent(id)}?${params}`)
    ).json()) as Record<string, unknown>;
    return {
      id: String(f['id']),
      name: String(f['name'] ?? 'Untitled'),
      mimeType: String(f['mimeType'] ?? ''),
      modifiedTime: typeof f['modifiedTime'] === 'string' ? f['modifiedTime'] : null,
      webViewLink: typeof f['webViewLink'] === 'string' ? f['webViewLink'] : null,
      size: f['size'] ? Number(f['size']) : null,
    };
  }

  /** A file's text (Docs, Sheets as CSV, Slides, text files), or null if it isn't readable. */
  async text(token: string, file: DriveFile): Promise<{ text: string; truncated: boolean } | null> {
    const plan = readPlan(file);
    if (plan.kind === 'unsupported') return null;
    const id = encodeURIComponent(file.id);
    const path =
      plan.kind === 'export'
        ? `/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(plan.mimeType)}`
        : `/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
    const text = await (await this.get(token, path, 30_000)).text();
    return text.length > MAX_TEXT
      ? { text: text.slice(0, MAX_TEXT), truncated: true }
      : { text, truncated: false };
  }
}
