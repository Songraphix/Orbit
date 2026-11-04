import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CloudOff,
  CloudCheck,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  MailCheck,
} from 'lucide-react';
import type { AccountView, SyncStatus } from '@shared/types/account';
import { FIELD, buttonClass } from '../../ui/controls';
import { Segmented } from '../../ui/Segmented';
import { Group, Row, Section } from './parts';

const invoke = window.orbit.invoke;

/** Main's error text without Electron's "Error invoking remote method…" prefix. */
const messageOf = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^(Account)?Error: /, '');

/** What syncs with an account (docs/FIREBASE.md); everything else stays on this Mac. */
const SYNCED = 'Projects, tasks, notes, Easels, Spaces, pinned tabs and favourites';

/**
 * Settings → Account (docs/FIREBASE.md): sign in to sync across your Macs — or don't, and
 * everything stays on this one. Main holds the session; this page only sees the email and the
 * state of sync.
 */
export function AccountSection() {
  const [view, setView] = useState<AccountView | null>(null);
  useEffect(() => {
    let live = true;
    void invoke('account:get', {}).then((v) => live && setView(v));
    const off = window.orbit.on('account:update', setView);
    return () => {
      live = false;
      off();
    };
  }, []);
  if (!view) return null;
  return (
    <Section
      id="account"
      title="Account"
      description="Sign in to sync across your Macs. Without an account, everything stays on this Mac."
    >
      {!view.available ? (
        <Group title="Orbit Account">
          <p className="px-4 py-3 text-label text-neutral-500" data-testid="account-unavailable">
            Accounts aren’t set up in this copy of Orbit.
          </p>
        </Group>
      ) : view.user ? (
        <SignedIn view={view} onView={setView} />
      ) : (
        <SignedOut view={view} onView={setView} />
      )}
    </Section>
  );
}

function SignedOut({ view, onView }: { view: AccountView; onView: (v: AccountView) => void }) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (what: string, call: () => Promise<AccountView>) => {
    setBusy(what);
    setError(null);
    call().then(
      (v) => {
        onView(v);
        setBusy(null);
      },
      (e: unknown) => {
        setError(messageOf(e));
        setBusy(null);
      },
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(mode, () =>
      invoke(mode === 'signIn' ? 'account:signIn' : 'account:signUp', { email, password }),
    );
  };
  return (
    <Group title="Orbit Account">
      <form onSubmit={submit} className="flex flex-col gap-3 px-4 py-4" data-testid="account-form">
        <p className="text-meta text-neutral-500">
          Syncs: {SYNCED}. Your history, open Today tabs and keys stay on this Mac.
        </p>
        {view.boundTo && (
          <p className="text-meta text-[#b25000]" data-testid="account-bound">
            This Mac’s Orbit data is synced with {view.boundTo}.
          </p>
        )}
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'signIn', label: 'Sign In' },
            { value: 'signUp', label: 'Create Account' },
          ]}
          label="Sign in or create an account"
          testId="account-mode"
        />
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${FIELD} w-full`}
          data-testid="account-email"
        />
        <input
          type="password"
          required
          minLength={mode === 'signUp' ? 6 : undefined}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signUp' ? 'Password (6 characters or more)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${FIELD} w-full`}
          data-testid="account-password"
        />
        {error && (
          <p className="text-meta text-[#d70015]" role="alert" data-testid="account-error">
            {error}
          </p>
        )}
        {view.notice && !error && (
          <p className="text-meta text-neutral-600" data-testid="account-notice">
            {view.notice}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy !== null}
            className={buttonClass('primary')}
            data-testid="account-submit"
          >
            {busy === mode && <LoaderCircle size={14} className="animate-spin" />}
            {mode === 'signIn' ? 'Sign In' : 'Create Account'}
          </button>
          {mode === 'signIn' && (
            <button
              type="button"
              disabled={busy !== null || !email.trim()}
              onClick={() => run('reset', () => invoke('account:resetPassword', { email }))}
              className={buttonClass('ghost')}
              title={email.trim() ? undefined : 'Enter your email first'}
              data-testid="account-reset"
            >
              Forgot password?
            </button>
          )}
          <span className="flex-1" />
          {busy === 'google' ? (
            <button
              type="button"
              onClick={() => void invoke('account:cancelGoogle', {})}
              className={buttonClass('secondary')}
            >
              <LoaderCircle size={14} className="animate-spin" /> Waiting for your browser… Cancel
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null || !view.google}
              onClick={() => run('google', () => invoke('account:google', {}))}
              className={buttonClass('secondary')}
              title={
                view.google ? 'Opens Google in your browser' : 'Google sign-in isn’t set up yet'
              }
              data-testid="account-google"
            >
              <GoogleMark /> Continue with Google
            </button>
          )}
        </div>
      </form>
    </Group>
  );
}

function SignedIn({ view, onView }: { view: AccountView; onView: (v: AccountView) => void }) {
  const user = view.user!;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const needsPassword = user.providers.includes('password');
  const run = (what: string, call: () => Promise<AccountView>) => {
    setBusy(what);
    setError(null);
    call().then(
      (v) => {
        onView(v);
        setBusy(null);
      },
      (e: unknown) => {
        setError(messageOf(e));
        setBusy(null);
      },
    );
  };
  return (
    <>
      <Group title="Orbit Account">
        <Row
          label={user.email}
          hint={user.providers.includes('google.com') ? 'Google account' : 'Email account'}
        >
          <button
            type="button"
            onClick={() => run('signOut', () => invoke('account:signOut', {}))}
            className={buttonClass('secondary')}
            data-testid="account-sign-out"
          >
            Sign Out
          </button>
        </Row>
        {!user.emailVerified && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3" data-testid="account-verify">
            <MailCheck size={16} className="text-[#b25000]" />
            <span className="min-w-0 flex-1 text-label">
              Open the link we emailed to {user.email} to turn on sync.
            </span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('resend', () => invoke('account:resendVerification', {}))}
              className={buttonClass('ghost', 'sm')}
            >
              Send Again
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('check', () => invoke('account:checkVerification', {}))}
              className={buttonClass('primary', 'sm')}
              data-testid="account-check-verified"
            >
              I’ve Opened It
            </button>
          </div>
        )}
        {(view.notice || error) && (
          <div className="flex items-center gap-2 px-4 py-3">
            <p
              className={`min-w-0 flex-1 text-meta ${error ? 'text-[#d70015]' : 'text-neutral-600'}`}
              role={error ? 'alert' : undefined}
              data-testid={error ? 'account-error' : 'account-notice'}
            >
              {error ?? view.notice}
            </p>
            {!error && (
              <button
                type="button"
                onClick={() => run('dismiss', () => invoke('account:dismiss', {}))}
                className={buttonClass('ghost', 'sm')}
              >
                OK
              </button>
            )}
          </div>
        )}
      </Group>

      <Group title="Sync">
        <Row label="Status" hint={`Syncs: ${SYNCED}.`}>
          <div className="flex items-center gap-2">
            <SyncBadge sync={view.sync} />
            <button
              type="button"
              disabled={busy !== null || !user.emailVerified}
              onClick={() => run('sync', () => invoke('account:syncNow', {}))}
              className={buttonClass('secondary', 'sm')}
              data-testid="account-sync-now"
            >
              <RefreshCw size={13} className={busy === 'sync' ? 'animate-spin' : ''} /> Sync Now
            </button>
          </div>
        </Row>
        {view.sync.conflicts > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 text-meta text-neutral-600">
            <TriangleAlert size={14} className="text-[#b25000]" />
            <span className="flex-1" data-testid="account-conflicts">
              {view.sync.conflicts === 1
                ? 'A note or Easel was changed on two Macs at once. Both versions were kept.'
                : `${view.sync.conflicts} notes or Easels were changed on two Macs at once. Both versions of each were kept.`}
            </span>
            <button
              type="button"
              onClick={() => run('dismiss', () => invoke('account:dismiss', {}))}
              className={buttonClass('ghost', 'sm')}
            >
              OK
            </button>
          </div>
        )}
      </Group>

      <Group title="Delete Account">
        <Row
          label="Delete your Orbit account"
          hint="Removes the account and everything it keeps in the cloud. This Mac keeps its own copy."
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            {needsPassword && (
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password (if asked)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${FIELD} w-44`}
                data-testid="account-delete-password"
              />
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                run('delete', () => invoke('account:delete', { password: password || null }))
              }
              className={buttonClass('danger')}
              data-testid="account-delete"
            >
              Delete Account…
            </button>
          </div>
        </Row>
      </Group>
    </>
  );
}

function SyncBadge({ sync }: { sync: SyncStatus }) {
  const since = sync.lastSyncedAt ? new Date(sync.lastSyncedAt) : null;
  const time = since?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const [icon, text, tone] =
    sync.state === 'synced'
      ? [<CloudCheck key="i" size={15} />, time ? `Synced at ${time}` : 'Synced', 'text-[#1f7a3d]']
      : sync.state === 'syncing'
        ? [
            <LoaderCircle key="i" size={15} className="animate-spin" />,
            'Syncing…',
            'text-neutral-600',
          ]
        : sync.state === 'offline'
          ? [<CloudOff key="i" size={15} />, 'Waiting for a connection', 'text-neutral-500']
          : sync.state === 'verify-email'
            ? [<MailCheck key="i" size={15} />, 'Waiting for email verification', 'text-[#b25000]']
            : sync.state === 'error'
              ? [<TriangleAlert key="i" size={15} />, sync.error ?? 'Sync failed', 'text-[#d70015]']
              : [<CloudOff key="i" size={15} />, 'Off', 'text-neutral-500'];
  return (
    <span
      className={`flex items-center gap-1.5 text-label ${tone}`}
      data-testid="account-sync-state"
      data-state={sync.state}
    >
      {icon}
      {text}
      {sync.pending > 0 && sync.state !== 'synced' && (
        <span className="text-meta text-neutral-500">· {sync.pending} waiting</span>
      )}
    </span>
  );
}

/** Google's "G", as Google's sign-in guidelines ask for. */
function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
