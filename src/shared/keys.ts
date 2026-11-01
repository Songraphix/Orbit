/** Modifier symbols, in the order macOS writes them. */
const MODIFIERS = new Set(['⌃', '⌥', '⇧', '⌘']);

/**
 * A shortcut as tooltip key caps: "⇧⌘C" → ["⇧", "⌘", "C"], "⌃Tab" → ["⌃", "Tab"],
 * "⌥⌘L" → ["⌥", "⌘", "L"]. Pure.
 */
export function splitKeys(shortcut: string): string[] {
  const chars = [...shortcut.trim()];
  const out: string[] = [];
  let i = 0;
  while (i < chars.length && MODIFIERS.has(chars[i]!)) out.push(chars[i++]!);
  const rest = chars.slice(i).join('').trim();
  if (rest) out.push(rest.length === 1 ? rest.toUpperCase() : rest);
  return out;
}
