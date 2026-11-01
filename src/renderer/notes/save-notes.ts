/** Every editor on this page can save at once (before a note moves on or is deleted). */
export const savers = new Set<() => Promise<void>>();

/**
 * Saves every note open on this page, including the very last keystroke, and resolves once
 * main has it. Call before moving a note elsewhere, so the next place shows all of it.
 */
export function saveOpenNotes(): Promise<void> {
  return Promise.all([...savers].map((save) => save())).then(() => undefined);
}
