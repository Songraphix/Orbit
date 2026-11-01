import type { Session, WebContents } from 'electron';
import type { SiteSettingsRepository } from '../persistence/repositories/site-settings';
import type { OverlayController } from '../windows/overlay';
import { decide, describePermission, permissionKey } from './policy';

function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * PermissionService (PLAN.md section 4.3): installed on every profile's session. Electron would
 * otherwise grant every request; Orbit allows the harmless ones, asks about sensitive ones in
 * the overlay (remembering the answer per site), and refuses the rest.
 */
export class PermissionService {
  private readonly configured = new WeakSet<Session>();

  constructor(
    private readonly siteSettings: SiteSettingsRepository,
    /** The overlay of the window showing this page, if it's a tab. */
    private readonly overlayFor: (contents: WebContents) => OverlayController | null,
  ) {}

  configure(session: Session): void {
    if (this.configured.has(session)) return;
    this.configured.add(session);

    session.setPermissionRequestHandler((contents, permission, callback, details) => {
      const origin = originOf(details.requestingUrl ?? contents?.getURL());
      const media = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
      const key = permissionKey(permission, media);
      const stored = origin ? this.siteSettings.get(origin, key) : null;
      const decision = decide(permission, origin, stored);
      if (decision !== 'ask' || !origin || !contents) {
        callback(decision === 'allow');
        return;
      }
      const overlay = this.overlayFor(contents);
      if (!overlay) {
        callback(false); // popups and background pages can't ask
        return;
      }
      void overlay
        .ask({ kind: 'permission', origin, action: describePermission(permission, media) })
        .then((answer) => {
          if (answer.remember) this.siteSettings.set(origin, key, answer.allow ? 'allow' : 'deny');
          callback(answer.allow);
        });
    });

    // Synchronous checks (e.g. Notification.permission): only remembered or harmless grants pass.
    session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
      const origin = originOf(requestingOrigin);
      const media = 'mediaType' in details && details.mediaType ? [details.mediaType] : [];
      const stored = origin
        ? this.siteSettings.get(origin, permissionKey(permission, media))
        : null;
      return decide(permission, origin, stored) === 'allow';
    });
  }
}
