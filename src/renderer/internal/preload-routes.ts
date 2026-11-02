import type * as NotesPageModule from './notes/NotesPage';

/**
 * Notes pages' code, loaded by main.tsx before the first render when the page knows from its
 * address it's one: drawn at once, rather than held behind a Suspense fallback (which React
 * reveals no sooner than 300 ms after showing it).
 */
export const preloaded: { notes?: typeof NotesPageModule } = {};

export function preloadFor(hash: string): Promise<void> {
  const page = hash.replace(/^#\//, '').split('/')[0];
  if (page === 'notes' || page === 'note') {
    return import('./notes/NotesPage').then((m) => {
      preloaded.notes = m;
    });
  }
  return Promise.resolve();
}
