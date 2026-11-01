/** Pure tab-list helpers (no Electron imports). */

/**
 * Which tab becomes active after closing `closingId`. Closing an inactive tab keeps the current
 * one; closing the active tab moves to the tab below it, or the one above if it was last.
 */
export function nextActiveAfterClose(
  ids: readonly string[],
  closingId: string,
  activeId: string | null,
): string | null {
  if (closingId !== activeId) return activeId;
  const index = ids.indexOf(closingId);
  if (index === -1) return activeId;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}

/** Where a new tab goes: right after `afterId` if given and present, otherwise at the end. */
export function insertAfter(ids: readonly string[], newId: string, afterId?: string): string[] {
  const index = afterId ? ids.indexOf(afterId) : -1;
  if (index === -1) return [...ids, newId];
  return [...ids.slice(0, index + 1), newId, ...ids.slice(index + 1)];
}
