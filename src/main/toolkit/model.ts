/**
 * The Toolkit's pure helpers (roadmap P3.5, P3.6): page titles from HTML, tidy aspect ratios.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** A page's <title>, entities decoded. Pure. */
export function pageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return '';
  return match[1]!
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ENTITIES[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** "16:9", "4:3", "1:1" — or null when it isn't a tidy ratio. */
export function aspect(width: number, height: number): string | null {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  const [w, h] = [width / d, height / d];
  return w <= 32 && h <= 32 ? `${w}:${h}` : null;
}
