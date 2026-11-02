import { useSyncExternalStore } from 'react';
import type { ColorMode } from '@shared/theme';

/**
 * Light or dark, as Orbit draws right now. Main sets nativeTheme.themeSource from Settings →
 * Appearance, which is what `prefers-color-scheme` reports in every renderer, so this follows
 * both that setting and (on "System") the Mac.
 */
const query = () => window.matchMedia('(prefers-color-scheme: dark)');
function subscribe(onChange: () => void): () => void {
  const q = query();
  q.addEventListener('change', onChange);
  return () => q.removeEventListener('change', onChange);
}

export function useColorMode(): ColorMode {
  return useSyncExternalStore(subscribe, () => (query().matches ? 'dark' : 'light'));
}
