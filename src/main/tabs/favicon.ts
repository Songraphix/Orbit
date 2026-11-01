import type { Session } from 'electron';

/** Favicons larger than this are ignored (they're shown at 16 px). */
const MAX_BYTES = 200 * 1024;

/**
 * Fetches the first usable favicon with the tab's own session (so cookies/proxy match the page)
 * and returns it as a data: URL, so the shell never loads remote images itself.
 * Stopgap until the caching FaviconService in Phase 2.
 */
export async function fetchFaviconDataUrl(
  session: Session,
  candidates: readonly string[],
): Promise<string | null> {
  for (const url of candidates) {
    if (!/^https?:|^data:image\//.test(url)) continue;
    if (url.startsWith('data:image/')) return url.length <= MAX_BYTES * 1.4 ? url : null;
    try {
      const response = await session.fetch(url);
      const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!response.ok || !type.startsWith('image/')) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) continue;
      return `data:${type};base64,${bytes.toString('base64')}`;
    } catch {
      // Network error: try the next candidate.
    }
  }
  return null;
}
