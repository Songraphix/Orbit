import { useEffect } from 'react';

/** orbit:// internal pages, routed by the hash main loads (`#/newtab`, …). */
export function InternalApp() {
  const page = window.location.hash.replace(/^#\//, '');

  useEffect(() => {
    document.title = page === 'newtab' ? 'New Tab' : 'Not Found';
  }, [page]);

  if (page === 'newtab') return <main className="h-full" data-testid="newtab" />;
  return <main className="p-8 text-sm text-neutral-500">Page not found</main>;
}
