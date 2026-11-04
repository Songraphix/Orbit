import type { CloudConfig } from './config';
import { endpoints } from './config';
import { CloudError, requestJson } from './http';
import type { Fetch } from './http';

/**
 * Firebase Authentication through its REST API (Identity Toolkit). Orbit's main process holds
 * the session — the page never sees a token — and keeps only the refresh token, encrypted.
 * Passwords are sent to Firebase and never stored.
 */
export type SignedIn = {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** When the ID token expires (ms since epoch). */
  expiresAt: number;
};

export type AccountInfo = {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  providers: string[];
  /** When the account last signed in (ms) — deleting an account needs a recent sign-in. */
  lastLoginAt: number;
};

type TokenAnswer = {
  localId: string;
  email?: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
};

export class AuthApi {
  private readonly base: string;
  private readonly secure: string;

  constructor(
    private readonly config: CloudConfig,
    private readonly fetchImpl: Fetch,
    private readonly now: () => number = Date.now,
  ) {
    const e = endpoints(config);
    this.base = e.identity;
    this.secure = e.secureToken;
  }

  private call(method: string, body: unknown): Promise<unknown> {
    return requestJson(
      this.fetchImpl,
      `${this.base}/accounts:${method}?key=${this.config.apiKey}`,
      {
        body,
      },
    );
  }

  private signedIn(a: TokenAnswer, email = ''): SignedIn {
    return {
      uid: a.localId,
      email: a.email ?? email,
      idToken: a.idToken,
      refreshToken: a.refreshToken,
      expiresAt: this.now() + Number(a.expiresIn) * 1000,
    };
  }

  async signUp(email: string, password: string): Promise<SignedIn> {
    const a = (await this.call('signUp', {
      email,
      password,
      returnSecureToken: true,
    })) as TokenAnswer;
    return this.signedIn(a, email);
  }

  async signIn(email: string, password: string): Promise<SignedIn> {
    const a = (await this.call('signInWithPassword', {
      email,
      password,
      returnSecureToken: true,
    })) as TokenAnswer;
    return this.signedIn(a, email);
  }

  /** Google: Firebase checks the ID token Google gave the desktop sign-in. */
  async signInWithGoogle(googleIdToken: string): Promise<SignedIn> {
    const a = (await this.call('signInWithIdp', {
      postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnSecureToken: true,
      returnIdpCredential: true,
    })) as TokenAnswer;
    return this.signedIn(a);
  }

  /** A fresh ID token from the refresh token (an hour's worth). */
  async refresh(refreshToken: string): Promise<SignedIn> {
    const a = (await requestJson(this.fetchImpl, `${this.secure}/token?key=${this.config.apiKey}`, {
      form: { grant_type: 'refresh_token', refresh_token: refreshToken },
    })) as { user_id: string; id_token: string; refresh_token: string; expires_in: string };
    return {
      uid: a.user_id,
      email: '',
      idToken: a.id_token,
      refreshToken: a.refresh_token,
      expiresAt: this.now() + Number(a.expires_in) * 1000,
    };
  }

  async lookup(idToken: string): Promise<AccountInfo> {
    const a = (await this.call('lookup', { idToken })) as {
      users?: {
        localId: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
        lastLoginAt?: string;
        providerUserInfo?: { providerId: string }[];
      }[];
    };
    const u = a.users?.[0];
    if (!u) throw new CloudError('USER_NOT_FOUND', 'USER_NOT_FOUND');
    return {
      uid: u.localId,
      email: u.email ?? '',
      emailVerified: Boolean(u.emailVerified),
      displayName: u.displayName ?? '',
      providers: (u.providerUserInfo ?? []).map((p) => p.providerId),
      lastLoginAt: Number(u.lastLoginAt ?? 0),
    };
  }

  async sendVerification(idToken: string): Promise<void> {
    await this.call('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken });
  }

  async sendPasswordReset(email: string): Promise<void> {
    await this.call('sendOobCode', { requestType: 'PASSWORD_RESET', email });
  }

  async deleteAccount(idToken: string): Promise<void> {
    await this.call('delete', { idToken });
  }
}

/** Firebase's reasons, in words for the person signing in. */
export function authMessage(code: string): string {
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'There’s already an account with that email — sign in instead.';
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
      return 'That email and password don’t match an account.';
    case 'INVALID_EMAIL':
      return 'That doesn’t look like an email address.';
    case 'WEAK_PASSWORD':
      return 'Choose a password of at least 6 characters.';
    case 'MISSING_PASSWORD':
      return 'Enter your password.';
    case 'USER_DISABLED':
      return 'This account has been turned off.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many tries — wait a few minutes and try again.';
    case 'OPERATION_NOT_ALLOWED':
      return 'That way of signing in isn’t turned on for Orbit yet.';
    case 'TOKEN_EXPIRED':
    case 'INVALID_REFRESH_TOKEN':
    case 'USER_NOT_FOUND':
    case 'INVALID_ID_TOKEN':
      return 'You’ve been signed out — sign in again.';
    case 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN':
      return 'For your safety, sign in again before doing that.';
    default:
      return 'Something went wrong signing in. Try again in a moment.';
  }
}
