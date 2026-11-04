import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { SidebarRepository } from '../../src/main/persistence/repositories/sidebar';
import { WorkRepository } from '../../src/main/persistence/repositories/work';
import { NotesRepository } from '../../src/main/persistence/repositories/notes';
import { EaselRepository } from '../../src/main/persistence/repositories/easels';
import { cloudConfig } from '../../src/main/cloud/config';
import { AuthApi } from '../../src/main/cloud/auth-api';
import { FirestoreApi } from '../../src/main/cloud/firestore-api';
import type { Fetch } from '../../src/main/cloud/http';
import { SyncEngine } from '../../src/main/cloud/sync-engine';
import type { SyncKind } from '../../src/main/cloud/sync-model';
import type { SyncStatus } from '../../src/shared/types/account';

/** The Firebase Emulator (npm run test:cloud starts it); a demo- project never touches a real one. */
export const HOST = '127.0.0.1';
export const PROJECT = 'demo-orbit';
export const config = cloudConfig(
  {},
  { ORBIT_FIREBASE_EMULATOR: HOST, ORBIT_FIREBASE_PROJECT: PROJECT },
)!;
export const auth = new AuthApi(config, fetch);
export const firestore = new FirestoreApi(config, fetch);

/** Empties the emulator's accounts and documents. */
export async function resetEmulator(): Promise<void> {
  await fetch(`http://${HOST}:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

export type TestUser = {
  uid: string;
  email: string;
  password: string;
  token: () => Promise<string>;
};

/** A new account; verified (the real flow: the emailed link's code applied) unless asked not. */
export async function newUser(verified = true): Promise<TestUser> {
  const email = `t-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'correct horse battery';
  const signedUp = await auth.signUp(email, password);
  let refreshToken = signedUp.refreshToken;
  if (verified) {
    await auth.sendVerification(signedUp.idToken);
    await applyEmailCode(email, 'VERIFY_EMAIL');
    refreshToken = (await auth.refresh(refreshToken)).refreshToken; // the claim updates
  }
  let current = await auth.refresh(refreshToken);
  return {
    uid: signedUp.uid,
    email,
    password,
    token: async () => {
      if (current.expiresAt - Date.now() < 60_000)
        current = await auth.refresh(current.refreshToken);
      return current.idToken;
    },
  };
}

/** The emulator keeps the codes it would have emailed; this follows the link. */
export async function applyEmailCode(email: string, type: 'VERIFY_EMAIL' | 'PASSWORD_RESET') {
  const list = (await (
    await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/oobCodes`)
  ).json()) as { oobCodes: { email: string; oobCode: string; requestType: string }[] };
  const code = list.oobCodes.filter((c) => c.email === email && c.requestType === type).at(-1);
  if (!code) throw new Error(`no ${type} email for ${email}`);
  if (type === 'VERIFY_EMAIL') {
    await fetch(
      `http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oobCode: code.oobCode }),
      },
    );
  }
  return code.oobCode;
}

/** A Mac: its own Orbit database, with the defaults a fresh install has. */
export function newMac(): {
  db: Database;
  work: WorkRepository;
  notes: NotesRepository;
  easels: EaselRepository;
  sidebar: SidebarRepository;
} {
  const db = openDatabase(':memory:');
  migrate(db, migrations);
  const sidebar = new SidebarRepository(db);
  sidebar.ensureDefaults();
  return {
    db,
    sidebar,
    work: new WorkRepository(db),
    notes: new NotesRepository(db),
    easels: new EaselRepository(db),
  };
}

export type Device = {
  engine: SyncEngine;
  statuses: SyncStatus[];
  applied: SyncKind[][];
};

/** Sync for one Mac and account. `fetchImpl` lets a test take the network away. */
export function device(
  mac: { db: Database },
  user: TestUser,
  options: { fetchImpl?: Fetch; now?: () => number } = {},
): Device {
  const statuses: SyncStatus[] = [];
  const applied: SyncKind[][] = [];
  const engine = new SyncEngine({
    db: mac.db,
    api: options.fetchImpl ? new FirestoreApi(config, options.fetchImpl) : firestore,
    uid: user.uid,
    token: user.token,
    deviceId: randomUUID(),
    onPermissionDenied: async () => 'retry',
    onStatus: (s) => statuses.push(s),
    onApplied: (kinds) => applied.push([...kinds]),
    tickMs: 60_000, // tests drive it with syncNow()
    now: options.now,
    random: () => 0.5,
  });
  return { engine, statuses, applied };
}

/** Starts sync (a first sign-in here) and waits for the first round. */
export async function start(d: Device): Promise<void> {
  d.engine.start();
  await d.engine.syncNow();
}

/** Every document in the account (both collections), read straight from the emulator. */
export async function cloudDocs(user: TestUser): Promise<string[]> {
  const token = await user.token();
  const names: string[] = [];
  for (const c of ['records', 'parts'] as const) {
    let next: string | undefined;
    do {
      const page = await firestore.listNames(token, user.uid, c, next);
      names.push(...page.names.map((n) => n.slice(n.indexOf(`/${c}/`) + 1)));
      next = page.next ?? undefined;
    } while (next);
  }
  return names.sort();
}

export const project = (name: string) => ({
  name,
  description: '',
  status: 'active' as const,
  color: 'purple' as const,
  startDate: null,
  dueDate: null,
  spaceId: null,
});
