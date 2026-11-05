import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { InternalApp } from './InternalApp';
import { preloadFor } from './preload-routes';
import { startUiPrefs } from '../ui/prefs-store';
import { startCanvas } from '../ui/canvas-store';

// Text size, density, accent… (Settings → Appearance) for every Orbit page.
startUiPrefs('ui:update', { zoom: true });
startCanvas('canvas:update');

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

// A notes page loads its code first, so it's drawn whole on the first frame (no fallback).
void preloadFor(window.location.hash).finally(() => {
  createRoot(root).render(
    <StrictMode>
      <InternalApp />
    </StrictMode>,
  );
});
