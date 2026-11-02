import { z } from 'zod';

/**
 * Focus and calming sounds. Every one is generated on the Mac with Web Audio (noise, filters,
 * oscillators) — no recordings, nothing streamed, nothing to license — and plays in one hidden
 * Orbit page, so it keeps going whatever you browse.
 */
export const SOUND_IDS = [
  'rain',
  'ocean',
  'stream',
  'wind',
  'fire',
  'white',
  'pink',
  'brown',
  'alpha',
  'theta',
  'drone',
  'bowls',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export type SoundGroup = 'Nature' | 'Noise' | 'Calm';

export const SOUNDS: readonly { id: SoundId; name: string; group: SoundGroup; hint: string }[] = [
  { id: 'rain', name: 'Rain', group: 'Nature', hint: 'Steady rain on a roof' },
  { id: 'ocean', name: 'Ocean', group: 'Nature', hint: 'Slow waves rolling in' },
  { id: 'stream', name: 'Stream', group: 'Nature', hint: 'Water over stones' },
  { id: 'wind', name: 'Wind', group: 'Nature', hint: 'Soft wind, rising and falling' },
  { id: 'fire', name: 'Fireplace', group: 'Nature', hint: 'A crackling fire' },
  { id: 'white', name: 'White Noise', group: 'Noise', hint: 'Bright, even hiss' },
  { id: 'pink', name: 'Pink Noise', group: 'Noise', hint: 'Balanced, like steady rain' },
  { id: 'brown', name: 'Brown Noise', group: 'Noise', hint: 'Deep, warm rumble' },
  {
    id: 'alpha',
    name: 'Alpha Waves',
    group: 'Calm',
    hint: '10 Hz binaural beat for relaxed focus — use headphones',
  },
  {
    id: 'theta',
    name: 'Theta Waves',
    group: 'Calm',
    hint: '6 Hz binaural beat for unwinding — use headphones',
  },
  { id: 'drone', name: 'Calm Drone', group: 'Calm', hint: 'A slow, warm chord' },
  { id: 'bowls', name: 'Singing Bowls', group: 'Calm', hint: 'Bowls struck now and then' },
];

export const SOUND_GROUPS: readonly SoundGroup[] = ['Nature', 'Noise', 'Calm'];

export const soundIdSchema = z.enum(SOUND_IDS);

/** What's playing (null: nothing), whether it's paused, and how loud (0–1). */
export const soundStateSchema = z.object({
  playing: soundIdSchema.nullable(),
  paused: z.boolean(),
  volume: z.number().min(0).max(1),
  /** When "time's up" last chimed (the player strikes a bowl once, if it's recent). */
  chimeAt: z.number().nullable().default(null),
});
export type SoundState = z.output<typeof soundStateSchema>;

export const DEFAULT_VOLUME = 0.5;

export function soundName(id: SoundId): string {
  return SOUNDS.find((s) => s.id === id)?.name ?? id;
}

/** Perceived loudness → gain: the slider feels even from quiet to loud. Pure. */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}
