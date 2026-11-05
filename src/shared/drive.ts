import { z } from 'zod';

/**
 * Google Drive (roadmap R2 M3): connect a Google account, read-only, to find and read your Drive
 * files — in the command bar and for Orbit AI. Pure.
 */

/** The access Orbit asks for: read-only Drive, and your address (to show which account). */
export const DRIVE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

export const driveStatusSchema = z.object({
  /** Google sign-in is set up in this build (a Desktop OAuth client). */
  available: z.boolean(),
  connected: z.boolean(),
  email: z.string().nullable(),
  /** Something went wrong (in plain words), e.g. access was revoked. */
  error: z.string().nullable(),
  busy: z.boolean(),
});
export type DriveStatus = z.output<typeof driveStatusSchema>;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  webViewLink: string | null;
  size: number | null;
};

const KINDS: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.form': 'Google Forms',
  'application/vnd.google-apps.drawing': 'Google Drawings',
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.google-apps.shortcut': 'Shortcut',
  'application/pdf': 'PDF',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
  'application/json': 'JSON',
  'image/png': 'Image',
  'image/jpeg': 'Image',
};

/** "Google Docs", "PDF", "Word"… for a MIME type. */
export function driveKind(mimeType: string): string {
  if (KINDS[mimeType]) return KINDS[mimeType]!;
  if (mimeType.includes('wordprocessingml')) return 'Word';
  if (mimeType.includes('spreadsheetml')) return 'Excel';
  if (mimeType.includes('presentationml')) return 'PowerPoint';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  return 'File';
}

/**
 * Drive's search query for words: in the name or the text, not in the bin, no folders. Quotes
 * and backslashes are escaped (Drive's query language). Pure.
 */
export function driveQuery(words: string): string {
  const text = words.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const base = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  return text ? `${base} and (name contains '${text}' or fullText contains '${text}')` : base;
}

/** How a file's text is read: exported (Google's own formats), downloaded, or not at all. */
export function readPlan(
  file: Pick<DriveFile, 'mimeType' | 'size'>,
  maxBytes = 2_000_000,
):
  | { kind: 'export'; mimeType: string }
  | { kind: 'download' }
  | { kind: 'pdf' }
  | { kind: 'unsupported' } {
  switch (file.mimeType) {
    case 'application/vnd.google-apps.document':
      return { kind: 'export', mimeType: 'text/plain' };
    case 'application/vnd.google-apps.spreadsheet':
      return { kind: 'export', mimeType: 'text/csv' };
    case 'application/vnd.google-apps.presentation':
      return { kind: 'export', mimeType: 'text/plain' };
  }
  // PDFs: downloaded and read with PDF.js (text only), up to 30 MB.
  if (file.mimeType === 'application/pdf') {
    return (file.size ?? 0) <= 30_000_000 ? { kind: 'pdf' } : { kind: 'unsupported' };
  }
  const texty =
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    file.mimeType === 'application/xml';
  if (texty && (file.size ?? 0) <= maxBytes) return { kind: 'download' };
  return { kind: 'unsupported' };
}

/** "edited today", "edited 3 days ago", "edited 12 Mar 2026". Pure. */
export function editedLabel(modifiedTime: string | null, now: number): string {
  if (!modifiedTime) return '';
  const at = Date.parse(modifiedTime);
  if (!Number.isFinite(at)) return '';
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'edited today';
  if (days === 1) return 'edited yesterday';
  if (days < 30) return `edited ${days} days ago`;
  return `edited ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The email in an ID token (shown, never trusted for anything else). Pure. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
          c.charCodeAt(0),
        ),
      ),
    ) as { email?: unknown };
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}
