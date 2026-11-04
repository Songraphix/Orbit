import { beforeEach, describe, expect, it } from 'vitest';
import { CloudError } from '../../src/main/cloud/http';
import type { RecordDoc, Write } from '../../src/main/cloud/firestore-api';
import { config, firestore, HOST, newUser, resetEmulator } from './helpers';

/** Firestore Security Rules (firebase/firestore.rules), as the emulator enforces them. */
beforeEach(async () => {
  await resetEmulator();
});

const doc = (patch: Partial<RecordDoc> = {}): RecordDoc => ({
  kind: 'note',
  body: '{"id":"n1"}',
  parts: 0,
  deleted: false,
  v: 1,
  clientUpdatedAt: 1,
  deviceId: 'mac-1',
  ...patch,
});
const write = (docId: string, d: RecordDoc): Write => ({ kind: 'record', docId, doc: d });

async function denied(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CloudError) return error.code;
    throw error;
  }
  return 'ALLOWED';
}

/** A raw REST call, for what Orbit's own client never sends. */
async function raw(path: string, body: unknown, token?: string) {
  const r = await fetch(
    `http://${HOST}:8080/v1/projects/${config.projectId}/databases/(default)/documents${path}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  return r.status;
}

describe('Firestore rules', () => {
  it('owners read and write their own records', async () => {
    const me = await newUser();
    const token = await me.token();
    await firestore.commit(token, me.uid, [write('note_n1', doc())]);
    expect((await firestore.getRecord(token, me.uid, 'note_n1'))?.body).toBe('{"id":"n1"}');
  });

  it('nobody reads or writes someone else’s', async () => {
    const owner = await newUser();
    const other = await newUser();
    await firestore.commit(await owner.token(), owner.uid, [write('note_n1', doc())]);
    const theirs = await other.token();
    expect(await denied(firestore.getRecord(theirs, owner.uid, 'note_n1'))).toBe(
      'PERMISSION_DENIED',
    );
    expect(await denied(firestore.commit(theirs, owner.uid, [write('note_n2', doc())]))).toBe(
      'PERMISSION_DENIED',
    );
    expect(await denied(firestore.changedSince(theirs, owner.uid, null, 10))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('signed out, or email not verified yet: no access', async () => {
    const unverified = await newUser(false);
    expect(
      await denied(
        firestore.commit(await unverified.token(), unverified.uid, [write('note_n1', doc())]),
      ),
    ).toBe('PERMISSION_DENIED');
    // Signed out (no token at all): the account's records can't even be listed.
    const status = await raw(`/users/${unverified.uid}:runQuery`, {
      structuredQuery: { from: [{ collectionId: 'records' }] },
    });
    expect(status).toBe(403);
  });

  it('records must be well-formed: known kind, matching id, sizes and types', async () => {
    const me = await newUser();
    const token = await me.token();
    const tryWrite = (docId: string, d: RecordDoc) =>
      denied(firestore.commit(token, me.uid, [write(docId, d)]));
    expect(await tryWrite('history_1', doc({ kind: 'history' }))).toBe('PERMISSION_DENIED');
    expect(await tryWrite('task_n1', doc())).toBe('PERMISSION_DENIED'); // id must match kind
    expect(await tryWrite('note_n1', doc({ parts: 99 }))).toBe('PERMISSION_DENIED');
    expect(await tryWrite('note_n1', doc({ deleted: true }))).toBe('PERMISSION_DENIED'); // a tombstone carries no body
    expect(await tryWrite('note_n1', doc({ body: 'x'.repeat(900_001) }))).toBe('PERMISSION_DENIED');
    expect(await tryWrite('note_n1', doc({ deleted: true, body: '' }))).toBe('ALLOWED');
  });

  it('the update time is the server’s, not one the app makes up', async () => {
    const me = await newUser();
    const status = await raw(
      ':commit',
      {
        writes: [
          {
            update: {
              name: `projects/${config.projectId}/databases/(default)/documents/users/${me.uid}/records/note_n1`,
              fields: {
                kind: { stringValue: 'note' },
                body: { stringValue: '{}' },
                parts: { integerValue: '0' },
                deleted: { booleanValue: false },
                v: { integerValue: '1' },
                clientUpdatedAt: { integerValue: '1' },
                deviceId: { stringValue: 'x' },
                updatedAt: { timestampValue: '2099-01-01T00:00:00Z' },
              },
            },
          },
        ],
      },
      await me.token(),
    );
    expect(status).toBe(403);
  });

  it('paid entitlements can be read by their owner but never written by the app', async () => {
    const me = await newUser();
    const token = await me.token();
    const base = `projects/${config.projectId}/databases/(default)/documents/users/${me.uid}`;
    const grant = await raw(
      ':commit',
      {
        writes: [
          {
            update: {
              name: `${base}/entitlements/premium`,
              fields: { active: { booleanValue: true } },
            },
          },
        ],
      },
      token,
    );
    expect(grant).toBe(403);
    expect(await firestore.getMany(token, me.uid, ['entitlements/premium'])).toEqual([null]);
  });

  it('anything outside an account is closed', async () => {
    const me = await newUser();
    const status = await raw(
      ':commit',
      {
        writes: [
          {
            update: {
              name: `projects/${config.projectId}/databases/(default)/documents/public/x`,
              fields: { a: { stringValue: 'b' } },
            },
          },
        ],
      },
      await me.token(),
    );
    expect(status).toBe(403);
  });
});
