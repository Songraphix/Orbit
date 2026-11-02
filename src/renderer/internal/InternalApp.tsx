import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { librarySectionSchema } from '@shared/types/library';
import { ArchivePage } from './ArchivePage';
import { EaselPage } from './easel/EaselPage';
import { LibraryPage } from './library/LibraryPage';
import { NewTabPage } from './newtab/NewTabPage';
import { SettingsPage } from './SettingsPage';
import { BlockedPage } from './focus/BlockedPage';
import { SoundHost } from './sounds/SoundHost';
import { PopoutControls } from './popout/PopoutControls';
import { preloaded } from './preload-routes';

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
  blocked: 'Blocked',
  sounds: 'Orbit Sounds',
  popout: 'Video',
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
    // Internal pages use the normal page background — white, or dark in dark appearance
    // (.ui-light, tokens.css) — except the new tab page (wallpaper) and the Library
    // (transparent, over the space's colours). Notes pages paint their own.
    if (!['newtab', 'library', 'note', 'notes', 'popout'].includes(page)) {
      document.documentElement.classList.add('ui-light');
      document.documentElement.style.background = 'var(--color-white)';
    }
  }, [page]);

  if (page === 'newtab') return <NewTabPage />;
  if (page === 'archive') return <ArchivePage />;
  if (page === 'blocked' && param) return <BlockedPage encoded={param} />;
  if (page === 'sounds') return <SoundHost />;
  if (page === 'popout') return <PopoutControls />;
  if (page === 'settings') return <SettingsPage section={param || null} />;
  if (page === 'boost' && param)
    return (
      <Suspense fallback={null}>
        <BoostEditor id={param} />
      </Suspense>
    );
  if (page === 'easel' && param) return <EaselPage id={param} />;
  const notes = preloaded.notes;
  if (page === 'note' && param)
    return notes ? (
      <notes.NoteTabPage key={param} id={param} />
    ) : (
      <Suspense fallback={null}>
        <NoteTabPage key={param} id={param} />
      </Suspense>
    );
  if (page === 'notes' && param === 'panel')
    return notes ? (
      <notes.NotesPanelPage />
    ) : (
      <Suspense fallback={null}>
        <NotesPanelPage />
      </Suspense>
    );
  if (page === 'notes' && param === 'float' && sub)
    return notes ? (
      <notes.FloatingNotePage key={sub} id={sub} />
    ) : (
      <Suspense fallback={null}>
        <FloatingNotePage key={sub} id={sub} />
      </Suspense>
    );
  const section = librarySectionSchema.safeParse(param);
  if (page === 'library' && section.success)
    return <LibraryPage key={section.data} section={section.data} />;
  return <main className="p-8 text-sm text-neutral-500">Page not found</main>;
}
