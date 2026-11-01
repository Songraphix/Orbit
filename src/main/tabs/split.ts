import { clampRatio } from '../windows/layout';

/** Two tabs side by side (F-13): `ids[0]` is the left pane. Each Space keeps its split
 *  (roadmap P2.4), across restarts too. */
export type Split = { ids: readonly [string, string]; ratio: number };

/** A new split of `left` and `right`, or null if they're the same tab. Pure. */
export function makeSplit(left: string, right: string): Split | null {
  return left === right ? null : { ids: [left, right], ratio: 0.5 };
}

export function inSplit(split: Split | null, id: string | null): boolean {
  return split !== null && id !== null && split.ids.includes(id);
}

/** The other pane's tab, if `id` is in the split. Pure. */
export function partnerOf(split: Split | null, id: string): string | null {
  if (!split || !split.ids.includes(id)) return null;
  return split.ids[0] === id ? split.ids[1] : split.ids[0];
}

/** Activating a tab in the split just moves focus; any other tab ends the split. Pure. */
export function splitAfterActivate(split: Split | null, id: string): Split | null {
  return inSplit(split, id) ? split : null;
}

export function withRatio(split: Split, ratio: number): Split {
  return { ...split, ratio: clampRatio(ratio) };
}

/** Left ↔ right. Pure. */
export function swapped(split: Split): Split {
  return { ids: [split.ids[1], split.ids[0]], ratio: 1 - split.ratio };
}

/**
 * Activating a tab (roadmap P2.4, saved layouts): inside the split it just moves focus; any other
 * tab parks the split — the Space keeps it — and the parked split comes back when one of its tabs
 * is activated again. Pure.
 */
export function splitOnActivate(
  current: Split | null,
  parked: Split | null,
  id: string,
): { split: Split | null; parked: Split | null } {
  if (current && current.ids.includes(id)) return { split: current, parked: current };
  const keep = current ?? parked;
  if (keep && keep.ids.includes(id)) return { split: keep, parked: keep };
  return { split: null, parked: keep };
}
