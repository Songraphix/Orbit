import { lazy, Suspense, useEffect, useState } from 'react';
import type { EaselData } from '@shared/types/easels';
import { useAppearance } from '../appearance';

// Excalidraw's fonts ship with Orbit (see electron.vite.config.ts). It turns a relative path into
// one based on `location.origin`, which is "null" for file:// pages, so give it an absolute URL.
window.EXCALIDRAW_ASSET_PATH = new URL('../excalidraw/', window.location.href).href;

/** Excalidraw is large: only Easels load it. */
const EaselCanvas = lazy(() => import('./EaselCanvas'));

/** orbit://easel/<id> (F-19): a freeform canvas with drawings, notes and web captures. */
export function EaselPage({ id }: { id: string }) {
  const [easel, setEasel] = useState<EaselData | null | undefined>(undefined);
  const mode = useAppearance(); // dark spaces get a dark canvas, like Arc's Easels

  useEffect(() => {
    void window.orbit.invoke('easels:get', { id }).then(setEasel);
  }, [id]);

  useEffect(() => {
    if (easel) document.title = easel.title;
  }, [easel]);

  if (easel === undefined || mode === null) return null;
  if (easel === null) {
    return (
      <main className="p-8 text-sm text-neutral-500" data-testid="easel-missing">
        This Easel was deleted.
      </main>
    );
  }
  return (
    <div className="fixed inset-0" data-testid="easel-page">
      <Suspense fallback={null}>
        <EaselCanvas easel={easel} theme={mode} />
      </Suspense>
    </div>
  );
}
