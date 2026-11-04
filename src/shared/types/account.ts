import { z } from 'zod';

/** Cloud sync's state, as Settings → Account and the profile menu show it. */
export const syncStatusSchema = z.object({
  state: z.enum(['off', 'synced', 'syncing', 'offline', 'error', 'verify-email']),
  /** Changes waiting to go up. */
  pending: z.number().int(),
  lastSyncedAt: z.number().nullable(),
  /** In plain words, when something went wrong. */
  error: z.string().nullable(),
  /** Notes or Easels edited on two Macs, kept as copies (since the last look). */
  conflicts: z.number().int(),
});
export type SyncStatus = z.output<typeof syncStatusSchema>;

export const OFF_STATUS: SyncStatus = {
  state: 'off',
  pending: 0,
  lastSyncedAt: null,
  error: null,
  conflicts: 0,
};

/** The account, as the app sees it (never a token). */
export const accountViewSchema = z.object({
  /** Orbit was built with a Firebase project. */
  available: z.boolean(),
  /** Google sign-in is set up (a desktop OAuth client). */
  google: z.boolean(),
  user: z
    .object({
      uid: z.string(),
      email: z.string(),
      emailVerified: z.boolean(),
      providers: z.array(z.string()),
    })
    .nullable(),
  /** This Mac's synced data belongs to another account (its email), so sync can't start. */
  boundTo: z.string().nullable(),
  sync: syncStatusSchema,
  /** Something the person should know (a sent email, a sign-in problem). */
  notice: z.string().nullable(),
});
export type AccountView = z.output<typeof accountViewSchema>;
