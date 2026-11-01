export const APP_NAME = 'Orbit';

/** Renderer entry points built by electron-vite (see electron.vite.config.ts). */
export const RENDERER_ENTRIES = ['shell', 'overlay', 'internal'] as const;
export type RendererEntry = (typeof RENDERER_ENTRIES)[number];

/** Internal pages served at orbit://<page> by the internal renderer. More arrive in Phase 4/9. */
export const INTERNAL_PAGES = ['newtab', 'archive', 'settings', 'boost'] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];

export function isInternalPage(page: string): page is InternalPage {
  return (INTERNAL_PAGES as readonly string[]).includes(page);
}
