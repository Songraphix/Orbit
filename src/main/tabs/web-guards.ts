import { shell } from 'electron';
import type { WebContents } from 'electron';
import { decideWindowOpen } from './window-open';

/** Schemes a web page may navigate itself to. Everything else is blocked (PLAN.md section 4.8). */
const WEB_SCHEMES = new Set(['http:', 'https:']);
/** Schemes handed to macOS (Mail, FaceTime…) instead of loading in the page. */
const EXTERNAL_SCHEMES = new Set(['mailto:', 'tel:', 'facetime:', 'sms:']);

function protocolOf(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

function guardNavigation(event: { preventDefault(): void }, url: string): void {
  const protocol = protocolOf(url);
  if (protocol && WEB_SCHEMES.has(protocol)) return;
  event.preventDefault();
  if (protocol && EXTERNAL_SCHEMES.has(protocol)) void shell.openExternal(url);
}

export type OpenInTab = (url: string, activate: boolean) => void;

/**
 * Applies Orbit's rules to any web content (tabs and their popups):
 * - may only navigate to http(s); mailto:/tel: etc. go to macOS; orbit://, file:// are blocked;
 * - links that open new windows become tabs; real popups (sign-in) become sandboxed popup
 *   windows that keep `window.opener`, and get these same rules recursively.
 */
export function guardWebContents(contents: WebContents, openInTab: OpenInTab): void {
  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);

  contents.setWindowOpenHandler((details) => {
    const decision = decideWindowOpen(details);
    if (decision.kind === 'tab') {
      openInTab(decision.url, decision.activate);
      return { action: 'deny' };
    }
    if (decision.kind === 'popup') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: decision.width,
          height: decision.height,
          minWidth: 200,
          minHeight: 200,
          autoHideMenuBar: true,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  // Popups are real windows; give their contents the same rules.
  contents.on('did-create-window', (popup) => guardWebContents(popup.webContents, openInTab));
}
