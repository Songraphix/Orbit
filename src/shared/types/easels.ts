import { z } from 'zod';

export const easelIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const EASEL_BACKGROUNDS = ['plain', 'grid', 'dots'] as const;
export const easelBackgroundSchema = z.enum(EASEL_BACKGROUNDS);
export type EaselBackground = z.output<typeof easelBackgroundSchema>;

/** An Easel as its editor loads it (F-19). `scene` is Excalidraw JSON, '' when new. */
export const easelSchema = z.object({
  id: z.string(),
  title: z.string(),
  scene: z.string(),
  /** Behind the drawing: nothing, a grid of lines, or dots. */
  background: easelBackgroundSchema,
  updatedAt: z.number(),
});
export type EaselData = z.output<typeof easelSchema>;

/** An Easel in Library → Easels. */
export const easelEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string().nullable(),
  updatedAt: z.number(),
});
export type EaselEntry = z.output<typeof easelEntrySchema>;

/** A region captured from a web page, to place on an Easel. */
export const easelCaptureSchema = z.object({
  dataUrl: z.string(),
  /** Size in CSS pixels (the image itself is at device resolution). */
  width: z.number(),
  height: z.number(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
});
export type EaselCapture = z.output<typeof easelCaptureSchema>;
