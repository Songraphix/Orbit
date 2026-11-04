import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../src/main/cloud/account';
import type { SessionStore } from '../../src/main/cloud/account';
import type { AccountView } from '../../src/shared/types/account';
import {
  applyEmailCode,
  auth,
  cloudDocs,
  config,
  HOST,
  newMac,
  newUser,
  PROJECT,
  project,
  resetEmulator,
} from './helpers';

beforeEach(async () => {
  await resetEmulator();
});

/** The Keychain-backed store, in memory. */
function memoryStore(): SessionStore & { value: string | null } {
  return {
    value: null,
    canStore: true,
    get() {
      return this.value;
    },
    set(v) {
      this.value = v;
    },
    clear() {
      this.value = null;
    },
  };
}

function account(
  mac: ReturnType<typeof newMac>,
  store = memoryStore(),
  googleToken?: string,
): { service: AccountService; store: ReturnType<typeof memoryStore>; views: AccountView[] } {
  const views: AccountView[] = [];
  const service = new AccountService({
    config: { ...config, google: googleToken ? { clientId: 'test', clientSecret: 'test' } : null },
    db: mac.db,
    fetchImpl: fetch,
    store,
    onChange: (v) => views.push(v),
    onApplied: () => undefined,
    googleSignIn: googleToken ? async () => googleToken : null,
    tickMs: 60_000,
  });
  return { service, store, views };
}

const settle = async (service: AccountService) => {
  await service.syncNow();
  return service.view();
};

describe('accounts', () => {
  it('sign up: sync waits for the emailed link, then starts', async () => {
    const mac = newMac();
    mac.work.saveProject(project('Before signing up'));
    const { service } = account(mac);
    const email = 'new@example.com';
    let view = await service.signUp(email, 'a good password');
    expect(view.user?.email).toBe(email);
    expect(view.sync.state).toBe('verify-email');
    expect(view.notice).toMatch(/sent a link/);

    await applyEmailCode(email, 'VERIFY_EMAIL');
    view = await service.refreshVerification();
    expect(view.user?.emailVerified).toBe(true);
    view = await settle(service);
    expect(view.sync.state).toBe('synced');
    expect(
      (await cloudDocs({ ...(await signedIn(email, 'a good password')) })).some((d) =>
        d.startsWith('records/project_'),
      ),
    ).toBe(true);
  });

  it('wrong password: a plain reason, and nothing is kept', async () => {
    const user = await newUser();
    const { service, store } = account(newMac());
    await expect(service.signIn(user.email, 'wrong')).rejects.toThrow(/don’t match an account/);
    expect(store.value).toBeNull();
    expect(service.view().user).toBeNull();
  });

  it('a restart brings the session back; signing out keeps this Mac’s data', async () => {
    const user = await newUser();
    const mac = newMac();
    const first = account(mac);
    await first.service.signIn(user.email, user.password);
    expect(first.store.value).not.toContain(user.password); // never stored
    await first.service.syncNow();

    const second = account(mac, first.store); // Orbit restarted
    second.service.restore();
    expect(second.service.view().user?.email).toBe(user.email);
    expect((await settle(second.service)).sync.state).toBe('synced');

    const id = mac.work.saveProject(project('Stays here'));
    const view = second.service.signOut();
    expect(view.user).toBeNull();
    expect(view.sync.state).toBe('off');
    expect(first.store.value).toBeNull();
    expect(mac.work.project(id)?.name).toBe('Stays here');
  });

  it('another account can’t sign in to this Mac’s synced data (or receive it)', async () => {
    const owner = await newUser();
    const other = await newUser();
    const mac = newMac();
    mac.work.saveProject(project('Owner’s plan'));
    const { service } = account(mac);
    await service.signIn(owner.email, owner.password);
    await service.syncNow();
    service.signOut();

    await expect(service.signIn(other.email, other.password)).rejects.toThrow(owner.email);
    expect(service.view().boundTo).toBe(owner.email);
    expect(service.view().user).toBeNull();
    expect(await cloudDocs(other)).toEqual([]); // nothing of the owner's went to the other account

    // The owner can come back.
    await service.signIn(owner.email, owner.password);
    expect((await settle(service)).sync.state).toBe('synced');
  });

  it('password reset sends a link, without saying whether an account exists', async () => {
    const user = await newUser();
    const { service } = account(newMac());
    const known = await service.sendPasswordReset(user.email);
    expect(await applyEmailCode(user.email, 'PASSWORD_RESET')).toBeTruthy();
    const unknown = await service.sendPasswordReset('nobody@example.com');
    expect(known.notice?.replace(user.email, 'X')).toBe(
      unknown.notice?.replace('nobody@example.com', 'X'),
    );
  });

  it('a session that’s gone (account removed elsewhere) signs out cleanly', async () => {
    const user = await newUser();
    const mac = newMac();
    const { service, store } = account(mac);
    await service.signIn(user.email, user.password);
    await service.syncNow();
    // Removed by an admin: the refresh token stops working.
    await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/accounts`, {
      method: 'DELETE',
    });
    const restarted = account(mac, store);
    restarted.service.restore();
    await restarted.service.syncNow();
    expect(restarted.service.view().user).toBeNull();
    expect(restarted.service.view().notice).toMatch(/sign in again/);
    expect(store.value).toBeNull();
  });

  it('Google sign-in (the emulator stands in for Google)', async () => {
    const claims = JSON.stringify({ sub: 'g-123', email: 'g@example.com', email_verified: true });
    const { service } = account(newMac(), memoryStore(), claims);
    expect(service.view().google).toBe(true);
    const view = await service.signInWithGoogle();
    expect(view.user?.email).toBe('g@example.com');
    expect(view.user?.providers).toContain('google.com');
    expect((await settle(service)).sync.state).toBe('synced');
  });

  it('deleting the account removes its cloud data and the account; this Mac keeps its own', async () => {
    const user = await newUser();
    const mac = newMac();
    const id = mac.work.saveProject(project('Mine'));
    const { service } = account(mac);
    await service.signIn(user.email, user.password);
    await service.syncNow();
    expect((await cloudDocs(user)).length).toBeGreaterThan(0);
    const token = await user.token();

    const view = await service.deleteAccount(null); // just signed in: recent enough
    expect(view.user).toBeNull();
    expect(view.notice).toMatch(/deleted/);
    expect(mac.work.project(id)?.name).toBe('Mine');
    await expect(auth.signIn(user.email, user.password)).rejects.toThrow();
    // Its documents are gone (read with an admin's eye: the emulator's owner token).
    const left = await fetch(
      `http://${HOST}:8080/v1/projects/${PROJECT}/databases/(default)/documents/users/${user.uid}/records`,
      { headers: { authorization: 'Bearer owner' } },
    ).then((r) => r.json() as Promise<{ documents?: unknown[] }>);
    expect(left.documents ?? []).toEqual([]);
    expect(token).toBeTruthy();

    // A new account can now take this Mac's data with it.
    const next = await newUser();
    await service.signIn(next.email, next.password);
    await service.syncNow();
    expect((await cloudDocs(next)).some((d) => d === `records/project_${id}`)).toBe(true);
  });
});

async function signedIn(email: string, password: string) {
  const s = await auth.signIn(email, password);
  return {
    uid: s.uid,
    email,
    password,
    token: async () => (await auth.refresh(s.refreshToken)).idToken,
  };
}
