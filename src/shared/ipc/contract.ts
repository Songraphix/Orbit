import type { z } from 'zod';

/**
 * Every IPC channel lives here (PLAN.md section 4.4). Channel names follow `domain:verb`.
 * Main validates each payload with `input`; preloads derive a typed `invoke()` from this map.
 *
 * Empty until Phase 1 adds the router and the first channels (tabs:*, sidebar:*, …).
 */
export type ChannelSpec = { input: z.ZodType; output: z.ZodType };

export const contract = {} as const satisfies Record<string, ChannelSpec>;

export type Contract = typeof contract;
export type Channel = keyof Contract;

export const CHANNEL_NAME_PATTERN = /^[a-z]+:[a-z][a-zA-Z]*$/;
