import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { OverlayApp } from './OverlayApp';
import { startUiPrefs } from '../ui/prefs-store';

startUiPrefs('state:ui', { zoom: false });

// The overlay's glass is drawn dark; in light appearance its palette is mirrored (tokens.css).
document.documentElement.classList.add('ui-dark');
const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
