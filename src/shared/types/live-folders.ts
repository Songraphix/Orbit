import { appOptionsSchema } from '../apps';
import { z } from 'zod';

/** Where a Live Folder's items come from (F-28). */
export const liveSourceSchema = z.discriminatedUnion('type', [
  /** An RSS or Atom feed (the URL the user gave may be a site that links to one). */
  z.object({ type: z.literal('rss'), url: z.string().url() }),
  /** A GitHub repository's open pull requests or issues. */
  z.object({
    type: z.literal('github'),
    // GitHub owners: letters, digits, hyphens. Repos: also dots and underscores, but not . or ..
    repo: z.string().regex(/^[A-Za-z\d-]+\/(?!\.\.?$)[\w.-]+$/),
    what: z.enum(['pulls', 'issues']),
  }),
]);
export type LiveSource = z.output<typeof liveSourceSchema>;

/** Extra data on a sidebar item, stored as JSON (PLAN.md section 5.2 `data_json`). */
export const itemDataSchema = z.object({
  /** A Live Folder: its source and last refresh. */
  live: z
    .object({
      source: liveSourceSchema,
      refreshedAt: z.number().nullable(),
      error: z.string().nullable(),
    })
    .optional(),
  /** An item a Live Folder made: which source entry it is, and whether it's new (dot). */
  feed: z.object({ guid: z.string(), unread: z.boolean() }).optional(),
  /** A folder Tidy made (F-29). */
  tidy: z.literal(true).optional(),
  /** A favourite's App Hub options (brief M5): where it opens, which Spaces show it. */
  app: appOptionsSchema.optional(),
});
export type ItemData = z.output<typeof itemDataSchema>;
