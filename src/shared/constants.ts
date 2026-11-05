export const APP_NAME = 'Orbit';

/** Renderer entry points built by electron-vite (see electron.vite.config.ts). */
export const RENDERER_ENTRIES = ['shell', 'overlay', 'internal', 'voice'] as const;
export type RendererEntry = (typeof RENDERER_ENTRIES)[number];

/** Internal pages served at orbit://<page> by the internal renderer. More arrive in Phase 4/9. */
export const INTERNAL_PAGES = [
  'newtab',
  'archive',
  'settings',
  'boost',
  'library',
  'easel',
  'note',
  'notes',
  /** A site blocked while you focus (orbit://blocked/<its address>). */
  'blocked',
  /** The hidden page that plays focus sounds. */
  'sounds',
  /** The video pop-out's buttons, over the video in its floating window. */
  'popout',
] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];

export function isInternalPage(page: string): page is InternalPage {
  return (INTERNAL_PAGES as readonly string[]).includes(page);
}
