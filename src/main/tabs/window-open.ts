/**
 * What to do when a page opens a new window (PLAN.md section 4.9 #5). Pure.
 *
 * - Links (`target=_blank`, ⌘-click, `window.open(url)` without features) become Orbit tabs.
 * - Real popups (`window.open(url, name, 'width=…')`, disposition "new-window") open as genuine
 *   popup windows, because sign-in flows ("Sign in with Google") need `window.opener`.
 * - Anything that isn't http(s) is refused.
 */
export type WindowOpenDecision =
  | { kind: 'tab'; url: string; activate: boolean }
  | { kind: 'popup'; width: number; height: number }
  | { kind: 'deny' };

export type WindowOpenRequest = {
  url: string;
  disposition: string; // 'default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'other'
  features: string;
};

const POPUP_DEFAULT = { width: 500, height: 640 };
const POPUP_LIMITS = { min: 200, max: 2000 };

function isWebUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Parses `width=500,height=600` style feature strings. */
export function parseFeatures(features: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of features.split(/[,\s]+/)) {
    const [key, value = ''] = part.split('=');
    if (key) out[key.trim().toLowerCase()] = value.trim();
  }
  return out;
}

function clampSize(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(POPUP_LIMITS.max, Math.max(POPUP_LIMITS.min, n));
}

export function decideWindowOpen(request: WindowOpenRequest): WindowOpenDecision {
  // about:blank is how many sign-in popups start before redirecting; allow it only as a popup.
  const blank = request.url === '' || request.url === 'about:blank';
  if (!blank && !isWebUrl(request.url)) return { kind: 'deny' };

  if (request.disposition === 'new-window') {
    const f = parseFeatures(request.features);
    return {
      kind: 'popup',
      width: clampSize(f['width'], POPUP_DEFAULT.width),
      height: clampSize(f['height'], POPUP_DEFAULT.height),
    };
  }
  if (blank) return { kind: 'deny' };
  return { kind: 'tab', url: request.url, activate: request.disposition !== 'background-tab' };
}
