/**
 * Parses Arc's StorableSidebar.json (F-27). The format is undocumented; this follows what Arc
 * 1.x writes (checked against the owner's backup on 2026-11-01):
 *
 *   sidebar.containers[n] = { spaces: [id, space, …], items: [id, item, …], topAppsContainerIDs }
 *   space  = { id, title, profile, customInfo: { iconType, windowTheme }, containerIDs: ['unpinned', id, 'pinned', id] }
 *   item   = { id, parentID, childrenIds, title, data: { tab: { savedURL, savedTitle } } | { list: {} } | { itemContainer } | … }
 *   topAppsContainerIDs = [profileRef, containerId, …]   (favorites per profile)
 *
 * Pure: takes the parsed JSON, returns a plain tree. Unknown item types are skipped, but their
 * children are kept (e.g. a split view's tabs).
 */
export type ArcNode =
  | { kind: 'tab'; title: string; url: string }
  | { kind: 'folder'; title: string; children: ArcNode[] };

export type ArcTheme = {
  mode: 'light' | 'dark';
  /** 1–3 hex colours from the space's background. */
  colors: string[];
  noise: number;
  intensity: number;
};

export type ArcSpace = {
  arcId: string;
  title: string;
  /** An emoji, or the name of one of Arc's built-in icons (e.g. "planet"). */
  icon: string | null;
  /** 'default' or Arc's profile directory name (e.g. "Profile 1"). */
  profile: string;
  theme: ArcTheme | null;
  pinned: ArcNode[];
  today: ArcNode[];
};

export type ArcSidebar = {
  spaces: ArcSpace[];
  /** Favorites ("top apps") by profile. */
  favorites: Record<string, ArcNode[]>;
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Arc stores id/value pairs as alternating arrays: [id, value, id, value…]. */
function objectsOf(list: unknown): Json[] {
  return Array.isArray(list) ? list.filter(isObj) : [];
}

export function profileName(ref: unknown): string {
  if (!isObj(ref)) return 'default';
  if (ref['default']) return 'default';
  const custom = ref['custom'];
  if (isObj(custom) && isObj(custom['_0'])) {
    return str(custom['_0']['directoryBasename']) ?? 'default';
  }
  return 'default';
}

function iconOf(space: Json): string | null {
  const info = isObj(space['customInfo']) ? space['customInfo'] : {};
  const icon = isObj(info['iconType']) ? info['iconType'] : null;
  if (!icon) return null;
  return str(icon['emoji_v2']) ?? str(icon['emoji']) ?? str(icon['icon']);
}

const toHex = (c: Json): string | null => {
  const r = c['red'];
  const g = c['green'];
  const b = c['blue'];
  if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null;
  const h = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
};

/** Walks the theme's background, collecting colours and modifiers wherever they appear. */
export function themeOf(windowTheme: unknown): ArcTheme | null {
  if (!isObj(windowTheme) || !isObj(windowTheme['background'])) return null;
  const colors: string[] = [];
  let mode: 'light' | 'dark' = 'dark';
  let noise = 0;
  let intensity = 1;

  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!isObj(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'color' && isObj(value)) {
        const hex = toHex(value);
        if (hex && !colors.includes(hex)) colors.push(hex);
      } else if (key === 'contentOverBackgroundAppearance') {
        mode = value === 'light' ? 'light' : 'dark';
      } else if (key === 'noiseFactor' && typeof value === 'number') {
        noise = value;
      } else if (key === 'intensityFactor' && typeof value === 'number') {
        intensity = value;
      }
      walk(value);
    }
  };
  walk(windowTheme['background']);
  if (colors.length === 0) return null;
  return { mode, colors: colors.slice(0, 3), noise, intensity };
}

export function parseArcSidebar(json: unknown): ArcSidebar {
  const root = isObj(json) && isObj(json['sidebar']) ? json['sidebar'] : null;
  const containers = root ? objectsOf(root['containers']) : [];
  const container = containers.find((c) => Array.isArray(c['spaces']) && Array.isArray(c['items']));
  if (!container) throw new Error('This does not look like an Arc sidebar file');

  const items = new Map<string, Json>();
  for (const item of objectsOf(container['items'])) {
    const id = str(item['id']);
    if (id) items.set(id, item);
  }

  const toNodes = (childIds: unknown, seen = new Set<string>()): ArcNode[] => {
    const nodes: ArcNode[] = [];
    for (const id of Array.isArray(childIds) ? childIds : []) {
      if (typeof id !== 'string' || seen.has(id)) continue;
      seen.add(id);
      const item = items.get(id);
      if (!item) continue;
      const data = isObj(item['data']) ? item['data'] : {};
      const title = str(item['title']);
      if (isObj(data['tab'])) {
        const url = str(data['tab']['savedURL']);
        if (url)
          nodes.push({ kind: 'tab', url, title: title || str(data['tab']['savedTitle']) || url });
      } else if (isObj(data['list'])) {
        nodes.push({
          kind: 'folder',
          title: title || 'Folder',
          children: toNodes(item['childrenIds'], seen),
        });
      } else {
        // Split views, easels and other containers: keep whatever tabs they hold.
        nodes.push(...toNodes(item['childrenIds'], seen));
      }
    }
    return nodes;
  };

  const containerChildren = (containerId: string | null) =>
    containerId ? toNodes(items.get(containerId)?.['childrenIds']) : [];

  const spaces: ArcSpace[] = objectsOf(container['spaces']).map((space) => {
    const ids = Array.isArray(space['containerIDs']) ? space['containerIDs'] : [];
    const after = (label: string) => {
      const i = ids.indexOf(label);
      return i >= 0 ? str(ids[i + 1]) : null;
    };
    const info = isObj(space['customInfo']) ? space['customInfo'] : {};
    return {
      arcId: str(space['id']) ?? '',
      title: str(space['title']) || 'Space',
      icon: iconOf(space),
      profile: profileName(space['profile']),
      theme: themeOf(info['windowTheme']),
      pinned: containerChildren(after('pinned')),
      today: containerChildren(after('unpinned')),
    };
  });

  const favorites: Record<string, ArcNode[]> = {};
  const topApps = Array.isArray(container['topAppsContainerIDs'])
    ? container['topAppsContainerIDs']
    : [];
  for (let i = 0; i + 1 < topApps.length; i += 2) {
    const profile = profileName(topApps[i]);
    favorites[profile] = [...(favorites[profile] ?? []), ...containerChildren(str(topApps[i + 1]))];
  }

  return { spaces, favorites };
}

/** Counts for the import preview ("4 spaces, 11 favorites, 37 pinned tabs"). */
export function countArc(sidebar: ArcSidebar): {
  spaces: number;
  favorites: number;
  pinned: number;
  today: number;
} {
  const count = (nodes: ArcNode[]): number =>
    nodes.reduce((n, node) => n + (node.kind === 'tab' ? 1 : count(node.children)), 0);
  return {
    spaces: sidebar.spaces.length,
    favorites: Object.values(sidebar.favorites).reduce((n, f) => n + count(f), 0),
    pinned: sidebar.spaces.reduce((n, s) => n + count(s.pinned), 0),
    today: sidebar.spaces.reduce((n, s) => n + count(s.today), 0),
  };
}
