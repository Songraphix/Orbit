/**
 * Auto-archive and sleeping-tab policies (PLAN.md sections 4.7 and F-20). Pure: given tabs and
 * the time, say which to archive or put to sleep.
 */
export type TabFacts = {
  id: string;
  section: 'favorite' | 'pinned' | 'today';
  /** Last time the tab was shown (ms), or null if never. */
  lastActiveAt: number | null;
  /** Has a live page right now. */
  live: boolean;
  isActive: boolean;
  isAudible: boolean;
  /** Sites in Developer Mode are never auto-archived (F-30). */
  keep?: boolean;
  /** Its Space (null for favorites): a Space can have its own archive time (roadmap P4.4). */
  spaceId?: string | null;
};

export const ARCHIVE_AFTER_OPTIONS = {
  '12h': 12 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  never: Number.POSITIVE_INFINITY,
} as const;
export type ArchiveAfter = keyof typeof ARCHIVE_AFTER_OPTIONS;

/** Today tabs not shown for longer than the threshold. Never the active or a playing tab. */
export function tabsToArchive(
  tabs: readonly TabFacts[],
  now: number,
  after: ArchiveAfter | ((spaceId: string | null) => ArchiveAfter),
): string[] {
  const limit = (t: TabFacts) =>
    ARCHIVE_AFTER_OPTIONS[typeof after === 'function' ? after(t.spaceId ?? null) : after];
  return tabs
    .filter((t) => t.section === 'today' && !t.isActive && !t.isAudible && !t.keep)
    .filter((t) => t.lastActiveAt !== null && now - t.lastActiveAt > limit(t))
    .map((t) => t.id);
}

export type SleepPolicy = { maxLive: number; idleMs: number };
export const DEFAULT_SLEEP: SleepPolicy = { maxLive: 8, idleMs: 30 * 60_000 };

/**
 * Live pages to unload: any idle longer than `idleMs`, then the least recently used beyond
 * `maxLive`. Never the active tab or one playing audio.
 */
export function tabsToSleep(tabs: readonly TabFacts[], now: number, policy: SleepPolicy): string[] {
  const candidates = tabs.filter((t) => t.live && !t.isActive && !t.isAudible);
  const idle = candidates
    .filter((t) => now - (t.lastActiveAt ?? 0) > policy.idleMs)
    .map((t) => t.id);
  const keptLive = tabs.filter((t) => t.live).length - idle.length;
  const overflow = Math.max(0, keptLive - policy.maxLive);
  const lru = candidates
    .filter((t) => !idle.includes(t.id))
    .sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0))
    .slice(0, overflow)
    .map((t) => t.id);
  return [...idle, ...lru];
}
