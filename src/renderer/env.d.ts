import type { OrbitApi } from '@shared/types/orbit-api';

declare global {
  interface Window {
    orbit: OrbitApi;
  }
}

export {};
