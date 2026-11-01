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

const TITLES: Record<string, string> = {
  newtab: 'New Tab',
  archive: 'Archived Tabs',
  settings: 'Settings',
  boost: 'Boost',
  library: 'Library',
  easel: 'Easel',
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
  const [page = '', param = ''] = hash.replace(/^#\//, '').split('/');

  useEffect(() => {
    document.title = TITLES[page] ?? 'Not Found';
    // Internal pages other than the new tab page use the normal light page background.
    if (page !== 'newtab') document.documentElement.style.background = '#fff';
  }, [page]);

  if (page === 'newtab') return <NewTabPage />;
  if (page === 'archive') return <ArchivePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'boost' && param)
    return (
      <Suspense fallback={null}>
        <BoostEditor id={param} />
      </Suspense>
    );
  if (page === 'easel' && param) return <EaselPage id={param} />;
  const section = librarySectionSchema.safeParse(param);
  if (page === 'library' && section.success)
    return <LibraryPage key={section.data} section={section.data} />;
  return <main className="p-8 text-sm text-neutral-500">Page not found</main>;
}
