import type { CloudConfig } from './config';
import { endpoints } from './config';
import { CloudError, requestJson } from './http';
import type { Fetch } from './http';

/**
 * Cloud Firestore through its REST API. Orbit writes whole small documents in batched commits
 * (one billed write per document) and reads only what changed since it last looked, a page at
 * a time — no listeners, no polling of whole collections.
 */

/** A synced record as stored: its JSON body and a few plain fields (see firestore.rules). */
export type RecordDoc = {
  kind: string;
  body: string;
  parts: number;
  deleted: boolean;
  v: number;
  clientUpdatedAt: number;
  deviceId: string;
};

export type FetchedRecord = RecordDoc & {
  /** The document's id (`note_<id>`). */
  docId: string;
  /** Full resource name, for cursors. */
  name: string;
  /** When it was last written (the precondition for the next write). */
  updateTime: string;
  /** The server time it was written (the pull cursor). */
  updatedAt: string;
};

export type Precondition = { exists: boolean } | { updateTime: string };

export type Write =
  | {
      kind: 'record';
      docId: string;
      doc: RecordDoc;
      precondition?: Precondition;
    }
  | { kind: 'part'; partId: string; record: string; n: number; body: string }
  | { kind: 'delete'; path: string }
  | { kind: 'user'; schema: number };

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { referenceValue: string }
  | { nullValue: null };

type ApiDoc = { name: string; fields?: Record<string, Value>; updateTime: string };

const str = (v: string): Value => ({ stringValue: v });
const int = (v: number): Value => ({ integerValue: String(Math.trunc(v)) });
const bool = (v: boolean): Value => ({ booleanValue: v });

function field<T>(doc: ApiDoc, key: string, fallback: T): T {
  const v = doc.fields?.[key] as Record<string, unknown> | undefined;
  if (!v) return fallback;
  if ('stringValue' in v) return v['stringValue'] as T;
  if ('integerValue' in v) return Number(v['integerValue']) as T;
  if ('booleanValue' in v) return v['booleanValue'] as T;
  if ('timestampValue' in v) return v['timestampValue'] as T;
  return fallback;
}

export function decodeRecord(doc: ApiDoc): FetchedRecord {
  return {
    docId: doc.name.slice(doc.name.lastIndexOf('/') + 1),
    name: doc.name,
    updateTime: doc.updateTime,
    kind: field(doc, 'kind', ''),
    body: field(doc, 'body', ''),
    parts: field(doc, 'parts', 0),
    deleted: field(doc, 'deleted', false),
    v: field(doc, 'v', 1),
    clientUpdatedAt: field(doc, 'clientUpdatedAt', 0),
    deviceId: field(doc, 'deviceId', ''),
    updatedAt: field(doc, 'updatedAt', doc.updateTime),
  };
}

export class FirestoreApi {
  private readonly base: string;
  /** `projects/<id>/databases/(default)/documents` */
  readonly root: string;

  constructor(
    config: CloudConfig,
    private readonly fetchImpl: Fetch,
  ) {
    this.base = endpoints(config).firestore;
    this.root = `projects/${config.projectId}/databases/(default)/documents`;
  }

  userPath(uid: string): string {
    return `${this.root}/users/${uid}`;
  }

  /** One atomic batch (≤ 500 writes). Returns each write's new update time, in order. */
  async commit(token: string, uid: string, writes: readonly Write[]): Promise<string[]> {
    const user = this.userPath(uid);
    const body = {
      writes: writes.map((w) => {
        switch (w.kind) {
          case 'record':
            return {
              update: {
                name: `${user}/records/${w.docId}`,
                fields: {
                  kind: str(w.doc.kind),
                  body: str(w.doc.body),
                  parts: int(w.doc.parts),
                  deleted: bool(w.doc.deleted),
                  v: int(w.doc.v),
                  clientUpdatedAt: int(w.doc.clientUpdatedAt),
                  deviceId: str(w.doc.deviceId),
                },
              },
              // The server's own clock: the pull cursor and the rules' check.
              updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
              ...(w.precondition ? { currentDocument: w.precondition } : {}),
            };
          case 'part':
            return {
              update: {
                name: `${user}/parts/${w.partId}`,
                fields: { record: str(w.record), n: int(w.n), body: str(w.body) },
              },
            };
          case 'delete':
            return { delete: w.path ? `${user}/${w.path}` : user };
          case 'user':
            return {
              update: { name: user, fields: { schema: int(w.schema) } },
              updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
              currentDocument: { exists: false },
            };
        }
      }),
    };
    const answer = (await requestJson(this.fetchImpl, `${this.base}/${this.root}:commit`, {
      body,
      token,
    })) as { writeResults?: { updateTime?: string }[]; commitTime?: string };
    return (answer.writeResults ?? []).map((r) => r.updateTime ?? answer.commitTime ?? '');
  }

  /**
   * Records changed after `cursor` (server time and name), oldest first, `limit` at a time.
   * Reads are billed per document returned (and one for an empty answer).
   */
  async changedSince(
    token: string,
    uid: string,
    cursor: { updatedAt: string; name: string } | null,
    limit: number,
  ): Promise<FetchedRecord[]> {
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'records' }],
        orderBy: [
          { field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' },
          { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
        ],
        ...(cursor
          ? {
              startAt: {
                values: [{ timestampValue: cursor.updatedAt }, { referenceValue: cursor.name }],
                before: false,
              },
            }
          : {}),
        limit,
      },
    };
    const rows = (await requestJson(this.fetchImpl, `${this.base}/${this.userPath(uid)}:runQuery`, {
      body: query,
      token,
    })) as { document?: ApiDoc }[];
    return rows.filter((r) => r.document).map((r) => decodeRecord(r.document!));
  }

  /** Names of every document in one of the account's collections (to delete the account). */
  async listNames(
    token: string,
    uid: string,
    collection: 'records' | 'parts',
    pageToken?: string,
  ): Promise<{ names: string[]; next: string | null }> {
    const params = new URLSearchParams({ pageSize: '300', 'mask.fieldPaths': '__name__' });
    if (pageToken) params.set('pageToken', pageToken);
    const answer = (await requestJson(
      this.fetchImpl,
      `${this.base}/${this.userPath(uid)}/${collection}?${params}`,
      { token },
    )) as { documents?: { name: string }[]; nextPageToken?: string };
    return {
      names: (answer.documents ?? []).map((d) => d.name),
      next: answer.nextPageToken ?? null,
    };
  }

  /** Some of the account's documents at once; missing ones come back null. */
  async getMany(token: string, uid: string, paths: readonly string[]): Promise<(ApiDoc | null)[]> {
    if (paths.length === 0) return [];
    const user = this.userPath(uid);
    const names = paths.map((p) => `${user}/${p}`);
    const rows = (await requestJson(this.fetchImpl, `${this.base}/${this.root}:batchGet`, {
      body: { documents: names },
      token,
    })) as { found?: ApiDoc; missing?: string }[];
    const byName = new Map(rows.filter((r) => r.found).map((r) => [r.found!.name, r.found!]));
    return names.map((n) => byName.get(n) ?? null);
  }

  async getRecord(token: string, uid: string, docId: string): Promise<FetchedRecord | null> {
    const [doc] = await this.getMany(token, uid, [`records/${docId}`]);
    return doc ? decodeRecord(doc) : null;
  }

  /** A record's spilled-over pieces, joined after its first. */
  async fullBody(token: string, uid: string, record: FetchedRecord): Promise<string> {
    if (record.parts === 0) return record.body;
    const paths = Array.from({ length: record.parts }, (_, i) => `parts/${record.docId}~${i + 1}`);
    const docs = await this.getMany(token, uid, paths);
    if (docs.some((d) => !d)) {
      throw new CloudError('INCOMPLETE', 'Part of a record is missing in the cloud');
    }
    return record.body + docs.map((d) => field(d!, 'body', '')).join('');
  }
}

/** A write that failed because the cloud's copy isn't what this Mac expected. */
export function isConflict(error: unknown): boolean {
  return (
    error instanceof CloudError &&
    ['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'NOT_FOUND'].includes(error.code)
  );
}
