import type { OrbitApi } from '@shared/types/orbit-api';

declare global {
  interface Window {
    orbit: OrbitApi;
    /** Where Excalidraw loads its fonts from (Easels); set before it renders. */
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

export {};
