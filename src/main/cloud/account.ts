import { randomUUID } from 'node:crypto';
import type { Database } from '../persistence/db';
import { OFF_STATUS } from '@shared/types/account';
import type { AccountView, SyncStatus } from '@shared/types/account';
import { AuthApi, authMessage } from './auth-api';
import type { SignedIn } from './auth-api';
import type { CloudConfig } from './config';
import { FirestoreApi } from './firestore-api';
import { CloudError, OfflineError } from './http';
import type { Fetch } from './http';
import { SyncEngine } from './sync-engine';
import type { SyncEngineDeps } from './sync-engine';

/** Where the session lives: encrypted (the Keychain), never in the database. */
export type SessionStore = {
  readonly canStore: boolean;
  get(): string | null;
  set(value: string): void;
  clear(): void;
};

type Session = {
  uid: string;
  email: string;
  refreshToken: string;
  emailVerified: boolean;
  providers: string[];
};

export type AccountDeps = {
  config: CloudConfig | null;
  db: Database;
  fetchImpl: Fetch;
  store: SessionStore;
  onChange: (view: AccountView) => void;
  onApplied: SyncEngineDeps['onApplied'];
  /** Google's desktop sign-in (opens the browser); resolves with Google's ID token. */
  googleSignIn: ((signal: AbortSignal) => Promise<string>) | null;
  now?: () => number;
  /** How often the sync queue is looked at (tests slow it down). */
  tickMs?: number;
};

/** A reason to show the person (Firebase's codes, put in words). */
export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountError';
  }
}

/** Deleting an account needs a sign-in from the last few minutes. */
const RECENT_LOGIN_MS = 5 * 60_000;

/**
 * Orbit accounts (docs/FIREBASE.md): optional — Orbit works fully without one, everything on
 * this Mac. Signing in syncs projects, tasks, notes, Easels, Spaces, pinned tabs and
 * favourites. Main holds the session; pages only ever see the account's email and state.
 *
 * This Mac's synced data belongs to the first account that signs in here: another account
 * can't sign in and see (or upload) it. Signing out keeps everything on this Mac.
 */
export class AccountService {
  private readonly auth: AuthApi | null;
  private readonly firestore: FirestoreApi | null;
  private session: Session | null = null;
  private idToken: { token: string; expiresAt: number } | null = null;
  private engine: SyncEngine | null = null;
  private notice: string | null = null;
  private boundTo: string | null = null;
  private googleAbort: AbortController | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: AccountDeps) {
    this.now = deps.now ?? Date.now;
    this.auth = deps.config ? new AuthApi(deps.config, deps.fetchImpl, this.now) : null;
    this.firestore = deps.config ? new FirestoreApi(deps.config, deps.fetchImpl) : null;
  }

  get available(): boolean {
    return this.auth !== null;
  }

  view(): AccountView {
    const s = this.session;
    return {
      available: this.available,
      google: Boolean(this.deps.config?.google && this.deps.googleSignIn),
      user: s
        ? { uid: s.uid, email: s.email, emailVerified: s.emailVerified, providers: s.providers }
        : null,
      boundTo: this.boundTo,
      sync: this.syncStatus(),
      notice: this.notice,
    };
  }

  private syncStatus(): SyncStatus {
    if (!this.session) return OFF_STATUS;
    const status = this.engine?.current ?? { ...OFF_STATUS, state: 'syncing' as const };
    if (!this.session.emailVerified && status.state !== 'offline') {
      return { ...status, state: 'verify-email' };
    }
    return status;
  }

  /** At launch: back to the account you were signed in to (no network needed). */
  restore(): void {
    if (!this.available) return;
    const saved = this.deps.store.get();
    if (!saved) return;
    try {
      this.session = JSON.parse(saved) as Session;
    } catch {
      this.deps.store.clear();
      return;
    }
    this.startSync();
    this.changed();
  }

  async signUp(email: string, password: string): Promise<AccountView> {
    const signed = await this.authCall((a) => a.signUp(email.trim(), password));
    await this.begin(signed, ['password'], false);
    await this.auth!.sendVerification(signed.idToken).catch(() => undefined);
    this.notice = `We sent a link to ${signed.email}. Open it to turn on sync.`;
    return this.changed();
  }

  async signIn(email: string, password: string): Promise<AccountView> {
    const signed = await this.authCall((a) => a.signIn(email.trim(), password));
    const info = await this.auth!.lookup(signed.idToken);
    await this.begin(signed, info.providers, info.emailVerified);
    return this.changed();
  }

  /** Opens Google in your browser; resolves once you've chosen your account there. */
  async signInWithGoogle(): Promise<AccountView> {
    if (!this.deps.googleSignIn || !this.deps.config?.google) {
      throw new AccountError('Google sign-in isn’t set up for this copy of Orbit yet.');
    }
    this.googleAbort?.abort();
    const abort = new AbortController();
    this.googleAbort = abort;
    try {
      const googleToken = await this.deps.googleSignIn(abort.signal);
      const signed = await this.authCall((a) => a.signInWithGoogle(googleToken));
      const info = await this.auth!.lookup(signed.idToken);
      await this.begin(signed, info.providers, info.emailVerified);
      return this.changed();
    } finally {
      if (this.googleAbort === abort) this.googleAbort = null;
    }
  }

  cancelGoogle(): void {
    this.googleAbort?.abort();
  }

  async sendPasswordReset(email: string): Promise<AccountView> {
    await this.authCall((a) => a.sendPasswordReset(email.trim())).catch((error: unknown) => {
      // Don't reveal whether an account exists for that email.
      if (!(error instanceof AccountError && /match an account/.test(error.message))) throw error;
    });
    this.notice = `If there’s an Orbit account for ${email.trim()}, a reset link is on its way.`;
    return this.changed();
  }

  async resendVerification(): Promise<AccountView> {
    const token = await this.token();
    await this.authCall((a) => a.sendVerification(token));
    this.notice = `We sent another link to ${this.session?.email}.`;
    return this.changed();
  }

  /** "I've clicked the link": checks with Firebase, then syncs. */
  async refreshVerification(quiet = false): Promise<AccountView> {
    if (!this.session) return this.view();
    this.idToken = null; // a fresh token carries the verified flag
    const info = await this.auth!.lookup(await this.token());
    this.session = { ...this.session, emailVerified: info.emailVerified };
    this.save();
    if (!quiet) {
      this.notice = info.emailVerified
        ? null
        : 'Not verified yet — open the link in the email first.';
    }
    if (info.emailVerified) {
      if (this.engine) void this.engine.syncNow();
      else this.startSync();
    }
    return this.changed();
  }

  /** Signs out: sync stops; everything stays on this Mac. */
  signOut(notice: string | null = null): AccountView {
    this.engine?.stop();
    this.engine = null;
    this.session = null;
    this.idToken = null;
    this.deps.store.clear();
    this.notice = notice ?? 'Signed out. Everything stays on this Mac.';
    return this.changed();
  }

  syncNow(): Promise<void> {
    return this.engine?.syncNow() ?? Promise.resolve();
  }

  /** Orbit came to the front: see if other Macs changed something (not too often). */
  pullSoon(): void {
    this.engine?.pullSoon();
  }

  clearNotice(): AccountView {
    this.notice = null;
    this.engine?.clearConflicts();
    return this.changed();
  }

  /**
   * Deletes the account and everything it keeps in the cloud. This Mac keeps its own copy
   * (it becomes a guest's again). Needs a recent sign-in: with a password, or Google again.
   */
  async deleteAccount(password: string | null): Promise<AccountView> {
    const session = this.session;
    if (!session || !this.firestore) return this.view();
    let token = await this.token();
    const info = await this.auth!.lookup(token);
    if (this.now() - info.lastLoginAt > RECENT_LOGIN_MS) {
      if (password) {
        const again = await this.authCall((a) => a.signIn(session.email, password));
        if (again.uid !== session.uid) throw new AccountError('That’s a different account.');
        this.useToken(again);
      } else if (info.providers.includes('google.com') && this.deps.googleSignIn) {
        const again = await this.authCall(async (a) =>
          a.signInWithGoogle(await this.deps.googleSignIn!(new AbortController().signal)),
        );
        if (again.uid !== session.uid) throw new AccountError('That’s a different account.');
        this.useToken(again);
      } else {
        throw new AccountError('Enter your password to delete your account.');
      }
      token = await this.token();
    }
    this.engine?.stop();
    this.engine = null;
    // The cloud data first (the rules need the account to delete it), then the account.
    for (const collection of ['parts', 'records'] as const) {
      for (;;) {
        const page = await this.firestore.listNames(token, session.uid, collection);
        if (page.names.length === 0) break;
        const user = this.firestore.userPath(session.uid);
        await this.firestore.commit(
          token,
          session.uid,
          page.names.map((n) => ({ kind: 'delete' as const, path: n.slice(user.length + 1) })),
        );
      }
    }
    await this.firestore.commit(token, session.uid, [{ kind: 'delete', path: '' }]).catch(() => {
      // The account's own small document may never have been made.
    });
    await this.authCall((a) => a.deleteAccount(token));
    this.forgetCloud();
    this.session = null;
    this.idToken = null;
    this.deps.store.clear();
    this.notice = 'Your account and its cloud data are deleted. Everything stays on this Mac.';
    return this.changed();
  }

  // ── Inside ──────────────────────────────────────────────────────────────────

  /** A signed-in account: check it may use this Mac's data, keep the session, start syncing. */
  private async begin(signed: SignedIn, providers: string[], verified: boolean): Promise<void> {
    const bound = this.getState('account');
    if (bound && bound !== signed.uid) {
      const email = this.getState('account-email') ?? 'another account';
      this.boundTo = email;
      throw new AccountError(
        `This Mac’s Orbit data is synced with ${email}. Sign in with that account to keep syncing.`,
      );
    }
    if (!this.deps.store.canStore) {
      throw new AccountError(
        'Secure storage isn’t available on this Mac, so Orbit can’t stay signed in.',
      );
    }
    this.boundTo = null;
    this.notice = null;
    this.session = {
      uid: signed.uid,
      email: signed.email,
      refreshToken: signed.refreshToken,
      emailVerified: verified,
      providers,
    };
    this.useToken(signed);
    this.save();
    this.setState('account', signed.uid);
    this.setState('account-email', signed.email);
    this.engine?.stop();
    this.engine = null;
    this.startSync();
  }

  /** Sync starts once the email is verified (the rules require it; until then, nothing to try). */
  private startSync(): void {
    if (!this.session || !this.firestore || this.engine) return;
    if (!this.session.emailVerified) return;
    this.engine = new SyncEngine({
      db: this.deps.db,
      api: this.firestore,
      uid: this.session.uid,
      token: () => this.token(),
      deviceId: this.deviceId(),
      onPermissionDenied: async () => {
        // Maybe the email was verified meanwhile (a new token says so), maybe not.
        await this.refreshVerification(true).catch(() => undefined);
        return this.session?.emailVerified ? 'retry' : 'verify-email';
      },
      onStatus: () => this.changed(),
      onApplied: this.deps.onApplied,
      tickMs: this.deps.tickMs,
    });
    this.engine.start();
  }

  /** A valid ID token, refreshed when it's close to expiring. Signs out if the session died. */
  private async token(): Promise<string> {
    const session = this.session;
    if (!session || !this.auth) throw new CloudError('SIGNED_OUT', 'Not signed in');
    if (this.idToken && this.idToken.expiresAt - this.now() > 2 * 60_000) return this.idToken.token;
    try {
      const fresh = await this.auth.refresh(session.refreshToken);
      this.useToken(fresh);
      if (fresh.refreshToken !== session.refreshToken) {
        this.session = { ...session, refreshToken: fresh.refreshToken };
        this.save();
      }
      return fresh.idToken;
    } catch (error) {
      if (
        error instanceof CloudError &&
        ['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_DISABLED', 'USER_NOT_FOUND'].includes(
          error.code,
        )
      ) {
        this.signOut(authMessage(error.code));
      }
      throw error;
    }
  }

  private useToken(signed: SignedIn): void {
    this.idToken = { token: signed.idToken, expiresAt: signed.expiresAt };
  }

  /** Runs an Auth call; Firebase's reasons become words, the network's become "offline". */
  private async authCall<T>(call: (auth: AuthApi) => Promise<T>): Promise<T> {
    if (!this.auth) throw new AccountError('Orbit accounts aren’t set up in this copy of Orbit.');
    try {
      return await call(this.auth);
    } catch (error) {
      if (error instanceof OfflineError) {
        throw new AccountError('Orbit couldn’t reach the internet. Check your connection.');
      }
      if (error instanceof CloudError) throw new AccountError(authMessage(error.code));
      throw error;
    }
  }

  /** The account is gone: this Mac's data is a guest's again, ready for a new account. */
  private forgetCloud(): void {
    const { db } = this.deps;
    db.exec("DELETE FROM sync_records; DELETE FROM sync_state WHERE key NOT IN ('device');");
  }

  private deviceId(): string {
    let id = this.getState('device');
    if (!id) {
      id = randomUUID();
      this.setState('device', id);
    }
    return id;
  }

  private save(): void {
    if (this.session) this.deps.store.set(JSON.stringify(this.session));
  }

  private getState(key: string): string | null {
    const row = this.deps.db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  private setState(key: string, value: string): void {
    this.deps.db
      .prepare(
        'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  private changed(): AccountView {
    const view = this.view();
    this.deps.onChange(view);
    return view;
  }
}
