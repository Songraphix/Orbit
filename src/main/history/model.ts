/**
 * Pure helpers for history search (PLAN.md F-21). No Electron or database imports.
 */

/**
 * Turns what the user typed into a safe FTS5 query: every word becomes a quoted prefix term,
 * so punctuation can't break the query syntax and "git" matches "github". Null if nothing
 * searchable remains.
 */
export function buildFtsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .split(/[\s/:.?#&=_-]+/)
    .map((t) => t.replace(/["*^()]/g, '').trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' ');
}

/** Only real web pages are recorded (not orbit://, about:, data:, search-engine pages stay). */
export function isRecordable(url: string): boolean {
  return /^https?:\/\//i.test(url) && url.length <= 4096;
}

/**
 * Combines text relevance with frecency. `bm25` from SQLite is negative (more negative = better).
 * Recent and frequently visited pages float up; prefix matches on the domain get a boost.
 */
export function historyScore(
  entry: { url: string; visitCount: number; lastVisitAt: number; bm25: number },
  query: string,
  now: number,
): number {
  const relevance = -entry.bm25; // higher is better
  const days = Math.max(0, (now - entry.lastVisitAt) / 86_400_000);
  const recency = 1 / (1 + days / 7); // 1 today, 0.5 after a week
  const frequency = Math.log2(1 + entry.visitCount);
  let host = '';
  try {
    host = new URL(entry.url).hostname.replace(/^www\./, '');
  } catch {
    // keep empty
  }
  const domainBoost = query && host.startsWith(query.toLowerCase().trim()) ? 3 : 0;
  return relevance + 2 * recency + frequency + domainBoost;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
