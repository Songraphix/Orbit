import type { Database } from '../db';

const PROFILE = 'default'; // profiles arrive in Phase 3

/** Per-site settings (PLAN.md section 5.2): zoom now; permissions, Peek, dev mode later. */
export class SiteSettingsRepository {
  constructor(private readonly db: Database) {}

  get(origin: string, key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM site_settings WHERE profile_id = ? AND origin = ? AND key = ?')
      .get(PROFILE, origin, key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(origin: string, key: string, value: string | null): void {
    if (value === null) {
      this.db
        .prepare('DELETE FROM site_settings WHERE profile_id = ? AND origin = ? AND key = ?')
        .run(PROFILE, origin, key);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO site_settings (profile_id, origin, key, value) VALUES (?, ?, ?, ?)
         ON CONFLICT (profile_id, origin, key) DO UPDATE SET value = excluded.value`,
      )
      .run(PROFILE, origin, key, value);
  }

  /** Zoom level for a host (Chromium levels: 0 = 100%, each step ≈ ×1.2). */
  zoomFor(url: string): number {
    const origin = originOf(url);
    if (!origin) return 0;
    const value = Number(this.get(origin, 'zoom'));
    return Number.isFinite(value) ? clampZoom(value) : 0;
  }

  setZoom(url: string, level: number): void {
    const origin = originOf(url);
    if (!origin) return;
    const clamped = clampZoom(level);
    this.set(origin, 'zoom', clamped === 0 ? null : String(clamped));
  }
}

/** Chrome's range is 25%–500%; in Chromium zoom levels that's about −7.6 … +8.8. */
export function clampZoom(level: number): number {
  return Math.round(Math.min(8.8, Math.max(-7.6, level)) * 10) / 10;
}

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}
