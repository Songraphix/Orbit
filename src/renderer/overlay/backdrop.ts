import { createContext } from 'react';
import type { OverlayState } from '@shared/types/command-bar';

/** The latest copy of the page under the overlay (main sends it as floating UI opens). */
export const BackdropContext = createContext<OverlayState['backdrop']>(null);
