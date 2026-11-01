import type { SiteSettingRow } from '@shared/types/site-controls';

/** One per-site setting the popover can show (F-12, Img 3). */
type SettingDef = {
  key: string;
  label: string;
  icon: SiteSettingRow['icon'];
  /** Choices in menu order; the first is the default (stored as "no value"). */
  options: readonly { value: string; label: string }[];
  /** Shown only once the site has asked for it (camera, microphone, location). */
  onlyIfStored?: boolean;
};

const PERMISSION = [
  { value: 'ask', label: 'Ask' },
  { value: 'allow', label: 'Allowed' },
  { value: 'deny', label: 'Blocked' },
] as const;

export const SITE_SETTINGS: readonly SettingDef[] = [
  { key: 'perm:notifications', label: 'Notifications', icon: 'bell', options: PERMISSION },
  {
    key: 'peek',
    label: 'Preview',
    icon: 'preview',
    options: [
      { value: 'on', label: 'Enabled' },
      { value: 'off', label: 'Disabled' },
    ],
  },
  {
    key: 'devMode',
    label: 'Developer Mode',
    icon: 'hammer',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
    ],
  },
  {
    key: 'perm:media:video',
    label: 'Camera',
    icon: 'camera',
    options: PERMISSION,
    onlyIfStored: true,
  },
  {
    key: 'perm:media:audio',
    label: 'Microphone',
    icon: 'mic',
    options: PERMISSION,
    onlyIfStored: true,
  },
  {
    key: 'perm:media:audio+video',
    label: 'Camera & Microphone',
    icon: 'camera',
    options: PERMISSION,
    onlyIfStored: true,
  },
  {
    key: 'perm:geolocation',
    label: 'Location',
    icon: 'location',
    options: PERMISSION,
    onlyIfStored: true,
  },
];

/** Local development servers, where Developer Mode is suggested (F-30). Pure. */
export function isLocalDev(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/** The popover's settings rows for a site, from its stored values. Pure. */
export function siteSettingRows(stored: Record<string, string>, url: string): SiteSettingRow[] {
  return SITE_SETTINGS.filter((def) => !def.onlyIfStored || stored[def.key] !== undefined).map(
    (def) => {
      const option = def.options.find((o) => o.value === stored[def.key]) ?? def.options[0]!;
      const suggested = def.key === 'devMode' && option.value === 'off' && isLocalDev(url);
      return {
        key: def.key,
        label: def.label,
        icon: def.icon,
        value: option.value,
        valueLabel: suggested ? 'Off — suggested for this site' : option.label,
        options: def.options.map((o) => ({ ...o })),
      };
    },
  );
}

/** What to store for a choice: the default is stored as nothing. Null for unknown input. Pure. */
export function storedValueFor(key: string, value: string): { ok: boolean; stored: string | null } {
  const def = SITE_SETTINGS.find((d) => d.key === key);
  if (!def || !def.options.some((o) => o.value === value)) return { ok: false, stored: null };
  return { ok: true, stored: value === def.options[0]!.value ? null : value };
}
