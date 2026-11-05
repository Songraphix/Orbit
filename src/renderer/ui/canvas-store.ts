import { useSyncExternalStore } from 'react';
import type { CanvasState } from '@shared/types/canvas';
import { accentVars } from '@shared/ui-prefs';

/**
 * The window's canvas (UI spec §4) in one renderer: the wallpaper and the theme main took from
 * it. Its variables are written to the page (a style sheet, so components' own palettes can
 * still override them locally), the tone goes on <html data-canvas-tone>, and with the
 * Automatic palette the wallpaper's accent becomes Orbit's accent. useCanvas() reads it.
 */
let current: CanvasState | null = null;
const listeners = new Set<() => void>();
const STYLE = 'orbit-canvas';

function set(next: CanvasState): void {
  current = next;
  apply(next);
  for (const l of listeners) l();
}

/** Starts following the canvas. `event`: 'state:canvas' (shell, overlay) or 'canvas:update'. */
export function startCanvas(event: 'state:canvas' | 'canvas:update'): void {
  const orbit = window.orbit as unknown as {
    invoke: (c: 'canvas:get', i: object) => Promise<CanvasState>;
    on: (c: string, l: (s: CanvasState) => void) => () => void;
  };
  orbit.on(event, set);
  void orbit.invoke('canvas:get', {}).then((first) => {
    if (!current) set(first);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCanvas(): CanvasState | null {
  return useSyncExternalStore(subscribe, () => current);
}

function apply(state: CanvasState): void {
  const root = document.documentElement;
  root.dataset['canvasTone'] = state.tone;
  let style = document.getElementById(STYLE);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE;
    document.head.append(style);
  }
  const vars = Object.entries(state.vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  // The wallpaper's accent, in both appearances (as text on pages, as a fill under white).
  const accent = (mode: 'light' | 'dark') =>
    state.auto
      ? Object.entries(accentVars(state.accent, mode))
          .map(([k, v]) => `${k}: ${v};`)
          .join(' ')
      : '';
  // `:root:root` outranks tokens.css's defaults wherever the sheets are; Orbit's own accent choice
  // (prefs-store, !important) still wins.
  // Surfaces with their own palette (notes, light/dark islands) take the accent too.
  const scopes = ':root:root, [data-note-theme], .ui-light, .ui-dark';
  style.textContent = `:root:root { ${vars} }
${scopes} { ${accent('light')} }
@media (prefers-color-scheme: dark) { ${scopes} { ${accent('dark')} } }`;
}
