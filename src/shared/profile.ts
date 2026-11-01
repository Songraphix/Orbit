import { z } from 'zod';

/** Profile colours (the avatar's circle), calm and readable with white text. */
export const PROFILE_COLORS = [
  '#5b5bd6',
  '#0a84ff',
  '#30a46c',
  '#e5484d',
  '#f76b15',
  '#d6409f',
  '#8e4ec6',
  '#12a594',
] as const;

/** Avatars to choose from (any single emoji is accepted). */
export const PROFILE_AVATARS = [
  '😀',
  '😎',
  '🧑‍💻',
  '🎨',
  '🚀',
  '🌿',
  '🔥',
  '⭐️',
  '🎧',
  '📚',
  '💼',
  '🏠',
  '🎮',
  '☕️',
  '🌊',
  '🦊',
] as const;

export const profileViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Your name, for the new tab page's greeting ('' = no name). */
  displayName: z.string(),
  /** An emoji, or '' for initials. */
  avatar: z.string(),
  /** A colour from PROFILE_COLORS. */
  color: z.string(),
  isDefault: z.boolean(),
});
export type ProfileView = z.output<typeof profileViewSchema>;

export const profilePatchSchema = z
  .object({
    name: z.string().max(40).optional(),
    displayName: z.string().max(40).optional(),
    avatar: z.string().max(16).optional(),
    color: z.string().max(16).optional(),
  })
  .strict();
export type ProfilePatch = z.output<typeof profilePatchSchema>;

/** A stable colour for a profile that hasn't chosen one. Pure. */
export function defaultProfileColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROFILE_COLORS[hash % PROFILE_COLORS.length]!;
}

/** "Work Stuff" → "WS", "joseph" → "J". Pure. */
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words.slice(0, 1);
  return letters.map((w) => [...w][0]!.toUpperCase()).join('') || '?';
}

/** One emoji (with its modifiers and joiners), not text. */
export function isEmoji(value: string): boolean {
  if (!value || value.length > 16) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
  return segments.length === 1 && /\p{Extended_Pictographic}/u.test(value);
}

/**
 * A patch made safe to store: names trimmed (an empty profile name is ignored), the avatar an
 * emoji or '' and the colour one of ours. Pure.
 */
export function cleanProfilePatch(patch: ProfilePatch): ProfilePatch {
  const out: ProfilePatch = {};
  if (patch.name !== undefined && patch.name.trim()) out.name = patch.name.trim().slice(0, 40);
  if (patch.displayName !== undefined) out.displayName = patch.displayName.trim().slice(0, 40);
  if (patch.avatar !== undefined && (patch.avatar === '' || isEmoji(patch.avatar)))
    out.avatar = patch.avatar;
  if (patch.color !== undefined && (PROFILE_COLORS as readonly string[]).includes(patch.color))
    out.color = patch.color;
  return out;
}

/** "Good morning" … "Good night", by the hour. Pure. */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}
