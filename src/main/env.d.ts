/** Build-time values electron-vite puts in the main process (from .env.local; see .env.example). */
interface ImportMetaEnv {
  readonly MAIN_VITE_FIREBASE_API_KEY?: string;
  readonly MAIN_VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly MAIN_VITE_FIREBASE_PROJECT_ID?: string;
  readonly MAIN_VITE_FIREBASE_APP_ID?: string;
  readonly MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID?: string;
  readonly MAIN_VITE_GOOGLE_DESKTOP_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
