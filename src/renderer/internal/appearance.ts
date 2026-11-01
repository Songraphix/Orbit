import { useEffect, useState } from 'react';
import type { Appearance } from '@shared/types/library';

/**
 * The window's space theme as CSS variables on this page (`--sidebar-fg`, `--tile-bg`…), so
 * the Library and Easels match the sidebar like Arc's. Refreshed when the page regains focus.
 */
export function useAppearance(): Appearance['mode'] | null {
  const [mode, setMode] = useState<Appearance['mode'] | null>(null);
  useEffect(() => {
    const load = () =>
      void window.orbit.invoke('appearance:get', {}).then(({ mode: next, vars }) => {
        const root = document.documentElement;
        for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
        root.style.colorScheme = next;
        root.dataset['mode'] = next;
        setMode(next);
      });
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);
  return mode;
}
