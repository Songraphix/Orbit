export const APP_NAME = 'Orbit';

/** Renderer entry points built by electron-vite (see electron.vite.config.ts). */
export const RENDERER_ENTRIES = ['shell', 'overlay', 'internal'] as const;
export type RendererEntry = (typeof RENDERER_ENTRIES)[number];
