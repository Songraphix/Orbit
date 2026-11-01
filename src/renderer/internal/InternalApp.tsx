import { useEffect } from 'react';
import { NewTabPage } from './newtab/NewTabPage';

/** orbit:// internal pages, routed by the hash main loads (`#/newtab`, …). */
export function InternalApp() {
  const page = window.location.hash.replace(/^#\//, '');

  useEffect(() => {
    document.title = page === 'newtab' ? 'New Tab' : 'Not Found';
  }, [page]);

  if (page === 'newtab') return <NewTabPage />;
  return <main className="p-8 text-sm text-neutral-500">Page not found</main>;
}
