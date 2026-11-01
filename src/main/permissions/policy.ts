/**
 * Which site permissions Orbit grants, asks about or refuses (PLAN.md section 4.8, F-31).
 * Pure. Electron's default is to grant everything, so every session gets a handler built on this.
 */
export type Decision = 'allow' | 'deny' | 'ask';

/** Harmless, or already gated by a user gesture in Chromium. */
const ALWAYS_ALLOW = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'pointerLock',
  'keyboardLock',
  'speaker-selection',
  'window-management',
]);

/** Worth asking the user about; the answer is remembered per site. */
const ASK = new Set([
  'media', // camera / microphone
  'geolocation',
  'notifications',
  'clipboard-read',
  'midi',
  'idle-detection',
  'display-capture',
  'storage-access',
  'top-level-storage-access',
]);

/** Human wording for the prompt ("example.com wants to use your camera"). */
export function describePermission(permission: string, mediaTypes: readonly string[] = []): string {
  switch (permission) {
    case 'media': {
      const video = mediaTypes.includes('video');
      const audio = mediaTypes.includes('audio');
      if (video && audio) return 'use your camera and microphone';
      if (video) return 'use your camera';
      if (audio) return 'use your microphone';
      return 'use your camera or microphone';
    }
    case 'geolocation':
      return 'know your location';
    case 'notifications':
      return 'show notifications';
    case 'clipboard-read':
      return 'see text and images copied to the clipboard';
    case 'midi':
      return 'use your MIDI devices';
    case 'idle-detection':
      return 'know when you’re actively using this device';
    case 'display-capture':
      return 'share your screen';
    case 'storage-access':
    case 'top-level-storage-access':
      return 'use cookies and data from other sites';
    default:
      return `use “${permission}”`;
  }
}

/** The settings key a remembered answer is stored under. Camera and mic are remembered apart. */
export function permissionKey(permission: string, mediaTypes: readonly string[] = []): string {
  if (permission === 'media') {
    const parts = [...mediaTypes].filter((t) => t === 'audio' || t === 'video').sort();
    return `perm:media:${parts.join('+') || 'any'}`;
  }
  return `perm:${permission}`;
}

/**
 * @param stored the remembered answer for this site, if any ('allow' | 'deny')
 * @param origin the requesting origin; only http(s) sites can be granted anything that asks
 */
export function decide(permission: string, origin: string | null, stored: string | null): Decision {
  if (ALWAYS_ALLOW.has(permission)) return 'allow';
  if (!ASK.has(permission)) return 'deny'; // unknown or risky (midiSysex, openExternal, …)
  if (!origin || !/^https?:\/\//.test(origin)) return 'deny';
  // Secure contexts only, as Chrome does (localhost counts as secure).
  const secure =
    origin.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!secure) return 'deny';
  if (stored === 'allow' || stored === 'deny') return stored;
  return 'ask';
}
