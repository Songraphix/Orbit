/** Chrome extension IDs: 32 letters a–p. */
const EXTENSION_ID = /^[a-p]{32}$/;

export function isExtensionId(value: string): boolean {
  return EXTENSION_ID.test(value);
}

/**
 * The extension a Chrome Web Store page is about, e.g.
 * https://chromewebstore.google.com/detail/adblock/gighmmpiobklfepjocnamgkkbiglidom → its ID.
 * Also accepts the old chrome.google.com/webstore URLs and a bare ID. Pure.
 */
export function webStoreIdFrom(input: string): string | null {
  const trimmed = input.trim();
  if (isExtensionId(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const store =
      (url.hostname === 'chromewebstore.google.com' && url.pathname.startsWith('/detail/')) ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore/detail/'));
    if (!store || url.protocol !== 'https:') return null;
    const id = url.pathname.split('/').filter(Boolean).find(isExtensionId);
    return id ?? null;
  } catch {
    return null;
  }
}

type IconMap = Record<string, string>;
export type ManifestIcons = {
  icons?: IconMap;
  action?: { default_icon?: string | IconMap; default_title?: string };
  browser_action?: { default_icon?: string | IconMap; default_title?: string };
};

/**
 * The best icon file for showing an extension at `size` px: the toolbar (action) icon first,
 * then the general icons; the smallest one at least `size`, else the largest. Pure.
 */
export function pickIconPath(manifest: ManifestIcons, size: number): string | null {
  const action = manifest.action?.default_icon ?? manifest.browser_action?.default_icon;
  if (typeof action === 'string') return action;
  for (const map of [action, manifest.icons]) {
    if (!map) continue;
    const sizes = Object.keys(map)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (sizes.length === 0) continue;
    const pick = sizes.find((n) => n >= size) ?? sizes.at(-1)!;
    return map[String(pick)] ?? null;
  }
  return null;
}
