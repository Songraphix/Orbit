import { DRIVE_SCOPES, emailFromIdToken } from '@shared/drive';
import type { DriveFile, DriveStatus } from '@shared/drive';
import { googleAuthorize, SignInCancelled } from '../cloud/google-signin';
import type { GoogleOptions } from '../cloud/google-signin';
import type { Fetch } from '../cloud/http';
import { DriveApi, DriveApiError } from './api';

/** Where the refresh token is kept (encrypted with the Keychain), as JSON. */
export type SecretStore = {
  readonly canStore: boolean;
  get(): string | null;
  set(value: string): void;
  clear(): void;
};

export type DriveDeps = {
  /** The Desktop OAuth client (null: not set up in this build). */
  google: { clientId: string; clientSecret: string } | null;
  fetchImpl: Fetch;
  openExternal: (url: string) => Promise<void> | void;
  store: SecretStore;
  onChange: (status: DriveStatus) => void;
  /** Development and tests: stand-ins for Google's addresses. */
  endpoints?: { auth: string; token: string; revoke: string; api: string };
  now?: () => number;
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

type Saved = { refreshToken: string; email: string | null };

/**
 * Google Drive, read-only (roadmap R2 M3). Connecting opens your browser (Google's installed-app
 * flow, PKCE); only the refresh token is kept, encrypted on this Mac; access tokens live in
 * memory. Disconnecting revokes access at Google and forgets the token. Nothing is indexed or
 * copied ahead of time: Drive is asked when you search or Orbit AI reads a file.
 */
export class DriveService {
  private api: DriveApi;
  private access: { token: string; expires: number } | null = null;
  private busy = false;
  private error: string | null = null;
  private abort: AbortController | null = null;

  constructor(private readonly deps: DriveDeps) {
    this.api = new DriveApi(deps.fetchImpl, deps.endpoints?.api);
  }

  private saved(): Saved | null {
    const raw = this.deps.store.get();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Saved;
      return parsed.refreshToken ? parsed : null;
    } catch {
      return null;
    }
  }

  get connected(): boolean {
    return this.saved() !== null;
  }

  status(): DriveStatus {
    const saved = this.saved();
    return {
      available: this.deps.google !== null && this.deps.store.canStore,
      connected: saved !== null,
      email: saved?.email ?? null,
      error: this.error,
      busy: this.busy,
    };
  }

  private changed(): void {
    this.deps.onChange(this.status());
  }

  /** Opens Google in your browser; you choose the account and allow read-only Drive access. */
  async connect(): Promise<DriveStatus> {
    const google = this.deps.google;
    if (!google) throw new Error('Google sign-in isn’t set up in this build of Orbit');
    if (this.busy) return this.status();
    this.busy = true;
    this.error = null;
    this.abort = new AbortController();
    this.changed();
    try {
      const options: GoogleOptions = {
        ...google,
        fetchImpl: this.deps.fetchImpl,
        openExternal: this.deps.openExternal,
        signal: this.abort.signal,
        ...(this.deps.endpoints
          ? { endpoints: { auth: this.deps.endpoints.auth, token: this.deps.endpoints.token } }
          : {}),
      };
      const tokens = await googleAuthorize(options, {
        scope: DRIVE_SCOPES.join(' '),
        done: 'Google Drive is connected to Orbit',
        offline: true,
      });
      if (!tokens.refresh_token || !tokens.access_token) {
        throw new Error('Google didn’t grant access. Try again.');
      }
      if (tokens.scope && !tokens.scope.includes('drive.readonly')) {
        throw new Error('Orbit needs permission to read your Drive files — tick it and try again');
      }
      this.deps.store.set(
        JSON.stringify({
          refreshToken: tokens.refresh_token,
          email: emailFromIdToken(tokens.id_token),
        }),
      );
      this.access = {
        token: tokens.access_token,
        expires: this.now() + (tokens.expires_in ?? 3600) * 1000,
      };
    } catch (error) {
      if (!(error instanceof SignInCancelled)) {
        this.error = error instanceof Error ? error.message : 'Google Drive couldn’t connect';
      }
    } finally {
      this.busy = false;
      this.abort = null;
      this.changed();
    }
    return this.status();
  }

  cancel(): void {
    this.abort?.abort();
  }

  /** Revokes Orbit's access at Google (best effort) and forgets it here. */
  async disconnect(): Promise<DriveStatus> {
    const saved = this.saved();
    this.deps.store.clear();
    this.access = null;
    this.error = null;
    if (saved) {
      const url = `${this.deps.endpoints?.revoke ?? REVOKE_URL}?token=${encodeURIComponent(saved.refreshToken)}`;
      await this.deps
        .fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(10_000) })
        .catch(() => undefined); // offline: Google forgets it when it's unused for long
    }
    this.changed();
    return this.status();
  }

  async search(
    words: string,
    options: { limit?: number; timeoutMs?: number } = {},
  ): Promise<DriveFile[]> {
    return this.withToken((token) =>
      this.api.search(token, words, options.limit, options.timeoutMs),
    );
  }

  /** One file's details and text (null text: not a kind Orbit can read). */
  async read(
    fileId: string,
  ): Promise<{ file: DriveFile; text: string | null; truncated: boolean }> {
    return this.withToken(async (token) => {
      const file = await this.api.file(token, fileId);
      const content = await this.api.text(token, file);
      return { file, text: content?.text ?? null, truncated: content?.truncated ?? false };
    });
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Runs with a fresh access token; a token Google rejects is refreshed once. */
  private async withToken<T>(run: (token: string) => Promise<T>): Promise<T> {
    let token = await this.token();
    try {
      return await run(token);
    } catch (error) {
      if (!(error instanceof DriveApiError) || error.status !== 401) throw error;
      this.access = null;
      token = await this.token();
      return run(token);
    }
  }

  private async token(): Promise<string> {
    if (this.access && this.access.expires - 60_000 > this.now()) return this.access.token;
    const saved = this.saved();
    const google = this.deps.google;
    if (!saved || !google)
      throw new Error('Google Drive isn’t connected (Settings → Integrations)');
    let response: Response;
    try {
      response = await this.deps.fetchImpl(this.deps.endpoints?.token ?? TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: saved.refreshToken,
          client_id: google.clientId,
          client_secret: google.clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('Orbit couldn’t reach Google');
    }
    const json = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (json.error === 'invalid_grant') {
      // Revoked at myaccount.google.com, or the password changed: connect again.
      this.deps.store.clear();
      this.error = 'Google Drive access ended — connect it again in Settings → Integrations';
      this.changed();
      throw new Error(this.error);
    }
    if (!response.ok || !json.access_token) throw new Error('Google Drive didn’t let Orbit in');
    this.access = {
      token: json.access_token,
      expires: this.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.access.token;
  }
}
