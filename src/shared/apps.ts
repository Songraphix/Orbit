import { z } from 'zod';

/**
 * The App Hub (brief §3, milestone M5): Favorites are your apps. Each can open as a tab (as
 * before), in the docked panel beside the page, or in its own small window; and show in every
 * Space or only some. Kept with the favourite (its item data) — no second launcher.
 */
export const OPEN_IN = ['tab', 'panel', 'window'] as const;
export type OpenIn = (typeof OPEN_IN)[number];

export const appOptionsSchema = z.object({
  openIn: z.enum(OPEN_IN),
  /** Spaces it shows in; null: all of them. */
  spaces: z.array(z.string().max(64)).max(50).nullable(),
});
export type AppOptions = z.output<typeof appOptionsSchema>;

export const DEFAULT_APP_OPTIONS: AppOptions = { openIn: 'tab', spaces: null };

/** The docked app panel, as the shell's header shows it. */
export const appPanelStateSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  url: z.string(),
  favicon: z.string().nullable(),
  isLoading: z.boolean(),
  canGoBack: z.boolean(),
  /** The app couldn't load (Chromium's net error code): the panel shows a card instead. */
  loadError: z.number().int().nullable().default(null),
  /** Pinned beside the page, or floating over it (unpinned; owner request, like Opera). */
  pinned: z.boolean().default(true),
  /** It can float (apps beside the rail; the right-hand dock is always pinned). */
  canPin: z.boolean().default(false),
});
export type AppPanelState = z.output<typeof appPanelStateSchema>;

/** A sidebar app that's running (kept alive out of sight), and whether it's playing sound. */
export const aliveAppSchema = z.object({ itemId: z.string(), audible: z.boolean() });
export type AliveApp = z.output<typeof aliveAppSchema>;

/** Settings → Apps: the favourites, and the Spaces they can show in. */
export const appListSchema = z.object({
  apps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      favicon: z.string().nullable(),
      openIn: z.enum(OPEN_IN),
      spaces: z.array(z.string()).nullable(),
    }),
  ),
  spaces: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type AppList = z.output<typeof appListSchema>;

/** The apps the docked panel can switch between: this Space's favourites that open in it, in
 *  the sidebar's order (folders' favourites too). Pure. */
export function panelApps<R extends { kind: string; openIn: OpenIn }>(
  favorites: readonly R[],
): R[] {
  return favorites.filter((row) => row.kind === 'tab' && row.openIn === 'panel');
}

/**
 * Settings → Apps' Spaces checklist: ticking or unticking `spaceId`. null is "Every Space"
 * (Spaces made later too); from there, ticking a Space means only that one. The last ticked
 * Space can't be unticked (an app shows somewhere). Kept in `all`'s order. Pure.
 */
export function toggleSpace(
  spaces: readonly string[] | null,
  spaceId: string,
  all: readonly string[],
): string[] | null {
  if (!spaces) return [spaceId];
  const current = new Set(spaces.filter((id) => all.includes(id)));
  if (current.has(spaceId)) {
    if (current.size === 1) return [...current];
    current.delete(spaceId);
  } else current.add(spaceId);
  return all.filter((id) => current.has(id));
}

/** "In every Space", "Only in Work", "In Work and Home", "In 3 Spaces". Pure. */
export function spacesLabel(
  spaces: readonly string[] | null,
  all: readonly { id: string; name: string }[],
): string {
  if (!spaces) return 'In every Space';
  const names = all.filter((s) => spaces.includes(s.id)).map((s) => s.name);
  if (names.length === 0) return 'In no Space';
  if (names.length === 1) return `Only in ${names[0]}`;
  if (names.length === 2) return `In ${names[0]} and ${names[1]}`;
  return `In ${names.length} Spaces`;
}

/** Whether a favourite shows in a Space. Pure. */
export function showsIn(options: AppOptions | undefined, spaceId: string): boolean {
  return !options?.spaces || options.spaces.includes(spaceId);
}

/** Whether the docked app can stay open in a Space: same profile, and shown there. Pure. */
export function panelAppShowsIn(
  item: { profileId: string; data?: { app?: AppOptions } | null },
  space: { id: string; profileId: string },
): boolean {
  return item.profileId === space.profileId && showsIn(item.data?.app, space.id);
}

/** "notion.so" → "https://notion.so/"; null if it isn't a web address. Pure. */
export function appUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Apps people often keep at hand, grouped (brief §3) — a starting point to add from, never
 *  added for you. */
export const APP_CATALOG: readonly {
  group: string;
  apps: readonly { name: string; url: string }[];
}[] = [
  {
    group: 'AI',
    apps: [
      { name: 'Claude', url: 'https://claude.ai/' },
      { name: 'ChatGPT', url: 'https://chatgpt.com/' },
      { name: 'Gemini', url: 'https://gemini.google.com/' },
      { name: 'Perplexity', url: 'https://www.perplexity.ai/' },
    ],
  },
  {
    group: 'Google',
    apps: [
      { name: 'Gmail', url: 'https://mail.google.com/' },
      { name: 'Calendar', url: 'https://calendar.google.com/' },
      { name: 'Drive', url: 'https://drive.google.com/' },
      { name: 'Docs', url: 'https://docs.google.com/' },
      { name: 'Translate', url: 'https://translate.google.com/' },
    ],
  },
  {
    group: 'Microsoft',
    apps: [
      { name: 'Outlook', url: 'https://outlook.office.com/' },
      { name: 'OneDrive', url: 'https://onedrive.live.com/' },
      { name: 'Teams', url: 'https://teams.microsoft.com/' },
    ],
  },
  {
    group: 'Design',
    apps: [
      { name: 'Figma', url: 'https://www.figma.com/' },
      { name: 'Canva', url: 'https://www.canva.com/' },
      { name: 'Pinterest', url: 'https://www.pinterest.com/' },
      { name: 'Adobe Express', url: 'https://new.express.adobe.com/' },
    ],
  },
  {
    group: 'Development',
    apps: [
      { name: 'GitHub', url: 'https://github.com/' },
      { name: 'GitLab', url: 'https://gitlab.com/' },
      { name: 'CodePen', url: 'https://codepen.io/' },
      { name: 'StackBlitz', url: 'https://stackblitz.com/' },
      { name: 'MDN', url: 'https://developer.mozilla.org/' },
    ],
  },
  {
    group: 'Communication',
    apps: [
      { name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
      { name: 'Telegram', url: 'https://web.telegram.org/' },
      { name: 'Messenger', url: 'https://www.messenger.com/' },
      { name: 'Slack', url: 'https://app.slack.com/' },
    ],
  },
  {
    group: 'Productivity',
    apps: [
      { name: 'Notion', url: 'https://www.notion.so/' },
      { name: 'Trello', url: 'https://trello.com/' },
      { name: 'Linear', url: 'https://linear.app/' },
      { name: 'Todoist', url: 'https://app.todoist.com/' },
    ],
  },
];
