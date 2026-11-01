import { net } from 'electron';

const MAX_BYTES = 256 * 1024;

/**
 * A site's icon as a data: URL, for a new tab shortcut to a site not in history yet: its
 * apple-touch-icon (large and sharp), else its favicon.ico. Asks only the site itself.
 */
export async function fetchSiteIcon(url: string, timeoutMs = 3000): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  for (const path of ['/apple-touch-icon.png', '/favicon.ico']) {
    try {
      const response = await net.fetch(`${origin}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) continue;
      return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
    } catch {
      // Offline, slow or refused: try the next, then fall back to a letter tile.
    }
  }
  return null;
}
