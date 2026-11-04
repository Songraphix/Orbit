import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { requestJson } from './http';
import type { Fetch } from './http';

/**
 * Google sign-in for a desktop app (Google's "installed app" flow, docs/FIREBASE.md): Orbit
 * opens your own browser (Google doesn't allow sign-in inside embedded browsers), Google sends
 * the answer to a one-off address on this Mac (127.0.0.1, a random port), and PKCE proves it
 * was this sign-in that asked. The result is Google's ID token, which Firebase then accepts.
 */
export class SignInCancelled extends Error {
  constructor(message = 'Sign-in was cancelled.') {
    super(message);
    this.name = 'SignInCancelled';
  }
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const WAIT_MS = 5 * 60_000;

const base64url = (b: Buffer) => b.toString('base64url');

/** The page your browser shows once it's done (Orbit can't close a tab it didn't open). */
const DONE_PAGE = (ok: boolean) => `<!doctype html><meta charset="utf-8"><title>Orbit</title>
<body style="font:15px -apple-system,sans-serif;display:grid;place-items:center;height:90vh;color:#333">
<div style="text-align:center"><h2>${ok ? 'You’re signed in to Orbit' : 'Sign-in didn’t finish'}</h2>
<p>${ok ? 'You can close this tab and go back to Orbit.' : 'Go back to Orbit and try again.'}</p></div>`;

export async function googleSignIn(options: {
  clientId: string;
  clientSecret: string;
  fetchImpl: Fetch;
  openExternal: (url: string) => Promise<void> | void;
  /** Rejects with SignInCancelled when this fires (the Cancel button). */
  signal?: AbortSignal;
}): Promise<string> {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SignInCancelled('Sign-in timed out.')), WAIT_MS);
      const stop = (error: Error) => {
        clearTimeout(timer);
        reject(error);
      };
      options.signal?.addEventListener('abort', () => stop(new SignInCancelled()));
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri);
        if (url.pathname !== '/') {
          res.writeHead(404).end();
          return;
        }
        const got = url.searchParams.get('code');
        const ok = Boolean(got) && url.searchParams.get('state') === state;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(DONE_PAGE(ok));
        clearTimeout(timer);
        if (ok) resolve(got!);
        else if (url.searchParams.get('error') === 'access_denied') reject(new SignInCancelled());
        else reject(new Error('Google sign-in didn’t finish. Try again.'));
      });
      const params = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account',
      });
      void Promise.resolve(options.openExternal(`${AUTH_URL}?${params}`)).catch(stop);
    });
    const tokens = (await requestJson(options.fetchImpl, TOKEN_URL, {
      form: {
        code,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      },
    })) as { id_token?: string };
    if (!tokens.id_token) throw new Error('Google didn’t confirm who you are. Try again.');
    return tokens.id_token;
  } finally {
    server.close();
  }
}
