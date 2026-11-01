import { z } from 'zod';

export const noteIdSchema = z.uuid();

/** The editor's document as JSON text, and its plain text (for titles, previews, search). */
export const NOTE_LIMITS = { doc: 2_000_000, text: 500_000 } as const;

export const noteSchema = z.object({
  id: noteIdSchema,
  /** '' for a brand-new note. */
  doc: z.string().max(NOTE_LIMITS.doc),
  updatedAt: z.number(),
  /** The project it belongs to, or null. */
  projectId: z.string().nullable(),
});
export type Note = z.output<typeof noteSchema>;

export const noteEntrySchema = z.object({
  id: noteIdSchema,
  title: z.string(),
  preview: z.string(),
  updatedAt: z.number(),
});
export type NoteEntry = z.output<typeof noteEntrySchema>;

/** Where a note is open: a tab, the side panel, a floating window, or the quick-note popup. */
export type NoteSurfaceKind = 'tab' | 'panel' | 'float' | 'quick';

/** Moving a note between places (or deleting it). */
export const noteActionSchema = z.enum(['tab', 'panel', 'float', 'delete']);
export type NoteAction = z.output<typeof noteActionSchema>;
