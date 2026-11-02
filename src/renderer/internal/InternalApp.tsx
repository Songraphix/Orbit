import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { librarySectionSchema } from '@shared/types/library';
import { ArchivePage } from './ArchivePage';
import { EaselPage } from './easel/EaselPage';
import { LibraryPage } from './library/LibraryPage';
import { NewTabPage } from './newtab/NewTabPage';
import { SettingsPage } from './SettingsPage';

// The Boost editor brings CodeMirror; load it only on orbit://boost pages (the new tab page
// shares this bundle and should stay light).
const BoostEditor = lazy(() =>
  import('./boost/BoostEditor').then((m) => ({ default: m.BoostEditor })),
);

// Notes bring the editor (Tiptap); load it only on note pages.
const NoteTabPage = lazy(() =>
  import('./notes/NotesPage').then((m) => ({ default: m.NoteTabPage })),
);
const NotesPanelPage = lazy(() =>
  import('./notes/NotesPage').then((m) => ({ default: m.NotesPanelPage })),
);
const FloatingNotePage = lazy(() =>
  import('./notes/NotesPage').then((m) => ({ default: m.FloatingNotePage })),
);

const TITLES: Record<string, string> = {
  newtab: 'New Tab',
  archive: 'Archived Tabs',
  settings: 'Settings',
  boost: 'Boost',
  library: 'Library',
  easel: 'Easel',
  note: 'Note',
  notes: 'Notes',
};

/** The hash main loaded; the Library changes it when switching sections. */
const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const readHash = () => window.location.hash;

/** orbit:// internal pages, routed by the hash main loads (`#/newtab`, `#/boost/<id>`, …). */
export function InternalApp() {
  const hash = useSyncExternalStore(subscribe, readHash);
  const [page = '', param = '', sub = ''] = hash.replace(/^#\//, '').split('/');

  useEffect(() => {
    document.title = TITLES[page] ?? 'Not Found';
    // Internal pages use the normal light page background, except the new tab page (wallpaper)
    // and the Library (transparent, over the space's colours).
    // Notes pages paint their own.
    if (!['newtab', 'library', 'note', 'notes'].includes(page)) {
      document.documentElement.style.background = '#fff';
      // A light page keeps light form controls when macOS is in dark mode.
      document.documentElement.style.colorScheme = 'light';
    }
  }, [page]);

  if (page === 'newtab') return <NewTabPage />;
  if (page === 'archive') return <ArchivePage />;
  if (page === 'settings') return <SettingsPage section={param || null} />;
  if (page === 'boost' && param)
    return (
      <Suspense fallback={null}>
        <BoostEditor id={param} />
      </Suspense>
    );
  if (page === 'easel' && param) return <EaselPage id={param} />;
  if (page === 'note' && param)
    return (
      <Suspense fallback={null}>
        <NoteTabPage key={param} id={param} />
      </Suspense>
    );
  if (page === 'notes' && param === 'panel')
    return (
      <Suspense fallback={null}>
        <NotesPanelPage />
      </Suspense>
    );
  if (page === 'notes' && param === 'float' && sub)
    return (
      <Suspense fallback={null}>
        <FloatingNotePage key={sub} id={sub} />
      </Suspense>
    );
  const section = librarySectionSchema.safeParse(param);
  if (page === 'library' && section.success)
    return <LibraryPage key={section.data} section={section.data} />;
  return <main className="p-8 text-sm text-neutral-500">Page not found</main>;
}
