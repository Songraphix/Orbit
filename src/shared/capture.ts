import { z } from 'zod';

/**
 * Orbit Capture (roadmap P2.1): findings saved from the web — a page or link, a quote, a code
 * snippet, a screenshot — kept as a project's research. Shared types and pure rules.
 */

export const CAPTURE_KINDS = ['link', 'text', 'code', 'image'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_LIMITS = { text: 20_000, comment: 500, title: 300, url: 4096 } as const;

/** A saved finding as the panel shows it (no full image: that's fetched when needed). */
export const captureSchema = z.object({
  id: z.string(),
  /** null = Unsorted. */
  projectId: z.string().nullable(),
  kind: z.enum(CAPTURE_KINDS),
  /** The page it came from. */
  title: z.string(),
  url: z.string(),
  /** The quote or snippet ('' for links and screenshots). */
  text: z.string(),
  /** A code snippet's language, when the page said ("ts", "python"…). */
  language: z.string(),
  hasImage: z.boolean(),
  /** Why it matters, in the user's words. */
  comment: z.string(),
  /** The task made from it, if any. */
  taskId: z.string().nullable(),
  createdAt: z.number(),
});
export type Capture = z.output<typeof captureSchema>;

/** What the Capture card shows while you decide where it goes. */
export const captureDraftSchema = z.object({
  /** One per capture: what you typed survives the card stepping aside for a screenshot. */
  id: z.string(),
  kind: z.enum(CAPTURE_KINDS),
  title: z.string(),
  url: z.string(),
  text: z.string(),
  language: z.string(),
  /** A small JPEG of a screenshot or image, for the card. */
  preview: z.string().nullable(),
  /** The page had a selection, so "Selection" can be chosen. */
  hasSelection: z.boolean(),
  projects: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
  /** Where it goes unless changed: the project this Space belongs to, else the last one used. */
  projectId: z.string().nullable(),
});
export type CaptureDraft = z.output<typeof captureDraftSchema>;

/** The host of a page ("www.figma.com" → "figma.com"), or '' if it isn't a URL. Pure. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const firstLine = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .find(Boolean) ?? '';

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** A short label for a finding: your comment, its first line, or the page's title. Pure. */
export function captureLabel(c: Pick<Capture, 'comment' | 'text' | 'title' | 'url' | 'kind'>) {
  const label =
    firstLine(c.comment) ||
    (c.kind === 'text' || c.kind === 'code' ? firstLine(c.text) : '') ||
    c.title.trim() ||
    hostOf(c.url) ||
    'Untitled';
  return clip(label, 120);
}

/**
 * A finding turned into a task (roadmap: "turn a finding into a task"): its title from your
 * comment, the quote, or the page; the quote or snippet and the source in the description.
 * Pure.
 */
export function taskFromCapture(
  c: Pick<Capture, 'comment' | 'text' | 'title' | 'url' | 'kind' | 'language'>,
): { title: string; description: string } {
  const title = clip(
    firstLine(c.comment) ||
      (c.kind === 'text' ? firstLine(c.text) : '') ||
      `Follow up: ${c.title.trim() || hostOf(c.url) || 'finding'}`,
    120,
  );
  const parts: string[] = [];
  if (c.text.trim()) {
    const body = clip(c.text.trim(), 1500);
    parts.push(c.kind === 'code' ? body : `“${body}”`);
  }
  if (c.url) parts.push(`Source: ${c.title.trim() || hostOf(c.url)} — ${c.url}`);
  return { title, description: parts.join('\n\n').slice(0, 2000) };
}

/** Every query word is in the finding somewhere. Pure. */
export function captureMatches(
  query: string,
  c: Pick<Capture, 'comment' | 'text' | 'title' | 'url'>,
): boolean {
  const haystack = `${c.comment}\n${c.text}\n${c.title}\n${c.url}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => haystack.includes(w));
}
