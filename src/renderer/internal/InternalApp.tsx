import { useEffect } from 'react';
import { ArchivePage } from './ArchivePage';
import { BoostEditor } from './boost/BoostEditor';
import { NewTabPage } from './newtab/NewTabPage';
import { SettingsPage } from './SettingsPage';

const TITLES: Record<string, string> = {
  newtab: 'New Tab',
  archive: 'Archived Tabs',
  settings: 'Settings',
  boost: 'Boost',
};

/** orbit:// internal pages, routed by the hash main loads (`#/newtab`, `#/boost/<id>`, …). */
export function InternalApp() {
  const [page = '', param = ''] = window.location.hash.replace(/^#\//, '').split('/');

  useEffect(() => {
    document.title = TITLES[page] ?? 'Not Found';
    // Internal pages other than the new tab page use the normal light page background.
    if (page !== 'newtab') document.documentElement.style.background = '#fff';
  }, [page]);

  if (page === 'newtab') return <NewTabPage />;
  if (page === 'archive') return <ArchivePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'boost' && param) return <BoostEditor id={param} />;
  return <main className="p-8 text-sm text-neutral-500">Page not found</main>;
}
