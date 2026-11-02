import { useSyncExternalStore } from 'react';
import { FONT_INFO, ROW_HEIGHT, TEXT_ZOOM, accentVars, isShown } from '@shared/ui-prefs';
import type { Feature, UiPrefs } from '@shared/ui-prefs';

/**
 * The customization preferences (brief M2) in one renderer: fetched once, kept up to date by
 * main's events, applied to the page — classes for density, motion and surfaces, the accent as
 * CSS variables and, on Orbit's own pages, the text size. Any component reads them with
 * useUiPrefs() / useShown().
 */
let current: UiPrefs | null = null;
const listeners = new Set<() => void>();

function set(next: UiPrefs, zoom: boolean): void {
  current = next;
  apply(next, zoom);
  for (const l of listeners) l();
}

/** Starts following the preferences. `event`: 'state:ui' (shell, overlay) or 'ui:update'. */
export function startUiPrefs(event: 'state:ui' | 'ui:update', options: { zoom: boolean }): void {
  const orbit = window.orbit as unknown as {
    invoke: (c: 'ui:get', i: object) => Promise<UiPrefs>;
    on: (c: string, l: (p: UiPrefs) => void) => () => void;
  };
  orbit.on(event, (next) => set(next, options.zoom));
  void orbit.invoke('ui:get', {}).then((first) => {
    if (!current) set(first, options.zoom);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUiPrefs(): UiPrefs | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** Whether a feature's buttons and rows show (hiding never touches its data). */
export function useShown(feature: Feature): boolean {
  return isShown(useUiPrefs(), feature);
}

const ACCENT_STYLE = 'orbit-accent';

function apply(prefs: UiPrefs, zoom: boolean): void {
  const root = document.documentElement;
  root.classList.toggle('motion-reduced', prefs.motion === 'reduced');
  root.classList.toggle('surfaces-solid', prefs.surfaces === 'solid');
  for (const d of ['compact', 'comfortable', 'spacious'] as const) {
    root.classList.toggle(`density-${d}`, prefs.density === d);
  }
  root.style.setProperty('--row-h', `${ROW_HEIGHT[prefs.density]}px`);
  root.style.setProperty('--font-ui', FONT_INFO[prefs.font].stack); // owner request: Comfortaa
  if (zoom) root.style.zoom = String(TEXT_ZOOM[prefs.textSize]);

  // The accent: a style sheet (so it wins over each surface's own palette), light and dark.
  let style = document.getElementById(ACCENT_STYLE);
  if (!prefs.accent) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = ACCENT_STYLE;
  }
  document.head.append(style); // last, after any lazily loaded style sheets
  const block = (mode: 'light' | 'dark') =>
    Object.entries(accentVars(prefs.accent!, mode))
      .map(([k, v]) => `${k}: ${v} !important;`)
      .join(' ');
  style.textContent = `:root, [data-note-theme], .ui-light, .ui-dark { ${block('light')} }
@media (prefers-color-scheme: dark) { :root, [data-note-theme], .ui-light, .ui-dark { ${block('dark')} } }`;
}
