/**
 * Orbit's Firebase project (docs/FIREBASE.md). The values come from `.env.local` at build time
 * (MAIN_VITE_*); they identify the project and aren't secrets — Security Rules and sign-in
 * protect the data. Tests point at the Firebase Emulator instead.
 */
export type CloudConfig = {
  apiKey: string;
  projectId: string;
  /** Google sign-in from a desktop app (Google Cloud → Credentials → Desktop app), if set up. */
  google: { clientId: string; clientSecret: string } | null;
  /** `127.0.0.1` (or another host) to use the Firebase Emulator: Auth on 9099, Firestore 8080. */
  emulator: string | null;
};

export type CloudEnv = Record<string, string | undefined>;

/** The project from the build's env, or null if Orbit was built without one. */
export function cloudConfig(built: CloudEnv, runtime: CloudEnv = {}): CloudConfig | null {
  const emulator = runtime['ORBIT_FIREBASE_EMULATOR']?.trim() || null;
  const apiKey = (emulator ? 'emulator-key' : built['MAIN_VITE_FIREBASE_API_KEY'])?.trim();
  const projectId = (
    emulator
      ? (runtime['ORBIT_FIREBASE_PROJECT'] ?? 'demo-orbit')
      : built['MAIN_VITE_FIREBASE_PROJECT_ID']
  )?.trim();
  if (!apiKey || !projectId) return null;
  const clientId = built['MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID']?.trim();
  const clientSecret = built['MAIN_VITE_GOOGLE_DESKTOP_CLIENT_SECRET']?.trim();
  return {
    apiKey,
    projectId,
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    emulator,
  };
}

export type Endpoints = { identity: string; secureToken: string; firestore: string };

export function endpoints(config: CloudConfig): Endpoints {
  const host = config.emulator;
  return host
    ? {
        identity: `http://${host}:9099/identitytoolkit.googleapis.com/v1`,
        secureToken: `http://${host}:9099/securetoken.googleapis.com/v1`,
        firestore: `http://${host}:8080/v1`,
      }
    : {
        identity: 'https://identitytoolkit.googleapis.com/v1',
        secureToken: 'https://securetoken.googleapis.com/v1',
        firestore: 'https://firestore.googleapis.com/v1',
      };
}
