/** The API the shell/overlay preload exposes as `window.orbit`. Grows from Phase 1. */
export type OrbitApi = {
  platform: string;
  versions: { electron: string; chrome: string };
};

/** The reduced API exposed to internal orbit:// pages. */
export type OrbitInternalApi = {
  platform: string;
};
