import { z } from 'zod';

/** What the Orbit menu can do (UI spec §5) — each one an existing Orbit action. */
export const ORBIT_MENU_ACTIONS = [
  'home',
  'command-bar',
  'space',
  'new-space',
  'workspaces',
  'profiles',
  'sync',
  'settings',
  'about',
  'quit',
] as const;
export type OrbitMenuAction = (typeof ORBIT_MENU_ACTIONS)[number];

/** What the menu shows: your Spaces, and sync's real state (null when sync isn't set up). */
export const orbitMenuViewSchema = z.object({
  spaces: z.array(
    z.object({ id: z.string(), name: z.string(), icon: z.string(), active: z.boolean() }),
  ),
  sync: z
    .object({
      state: z.enum(['synced', 'syncing', 'offline', 'error', 'verify-email']),
      label: z.string(),
    })
    .nullable(),
});
export type OrbitMenuView = z.output<typeof orbitMenuViewSchema>;
