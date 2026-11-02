import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import { ShellApp } from './ShellApp';
import { startUiPrefs } from '../ui/prefs-store';

startUiPrefs('state:ui', { zoom: false });

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <ShellApp />
  </StrictMode>,
);
