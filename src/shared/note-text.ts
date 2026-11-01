/** A note's title, preview and search (F-33), from its plain text. Pure; shared by main and the
 *  note pages. */

export const UNTITLED_NOTE = 'Untitled Note';

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** A note's title is its first line, like Apple Notes. */
export function noteTitle(text: string): string {
  const first = lines(text)[0];
  if (!first) return UNTITLED_NOTE;
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
}

/** What follows the title, on one line, for the notes list. */
export function notePreview(text: string, max = 140): string {
  const rest = lines(text).slice(1).join(' ');
  return rest.length > max ? `${rest.slice(0, max - 1).trimEnd()}…` : rest;
}

export function isBlankNote(text: string): boolean {
  return text.trim() === '';
}

/** Every word of the query appears somewhere in the note (any order, any case). */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
