import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  docIdFor,
  hashBody,
  MAX_WAIT_MS,
  mergeFields,
  parseDocId,
  QUIET_MS,
  readyToSend,
  resolveConflict,
  splitBody,
} from '../../src/main/cloud/sync-model';

describe('document ids', () => {
  it('round-trip, and reject anything that is not a synced kind', () => {
    expect(docIdFor('note', 'a1b2-c3')).toBe('note_a1b2-c3');
    expect(parseDocId('note_a1b2-c3')).toEqual({ kind: 'note', id: 'a1b2-c3' });
    expect(parseDocId('space_profile_x')).toEqual({ kind: 'space', id: 'profile_x' });
    expect(parseDocId('history_1')).toBeNull();
    expect(parseDocId('_x')).toBeNull();
    expect(parseDocId('note_')).toBeNull();
  });
});

describe('splitBody', () => {
  it('keeps small records whole and splits big ones without breaking characters', () => {
    expect(splitBody('{"a":1}')).toEqual(['{"a":1}']);
    const emoji = '😀'.repeat(5); // surrogate pairs
    const pieces = splitBody(emoji, 3);
    expect(pieces.join('')).toBe(emoji);
    for (const p of pieces) expect(p).toBe([...p].join('')); // no lone halves
    expect(pieces.every((p) => !/[\ud800-\udbff]$/.test(p))).toBe(true);
    const big = 'x'.repeat(650_000);
    expect(splitBody(big).map((p) => p.length)).toEqual([300_000, 300_000, 50_000]);
  });

  it('hashes the same JSON the same way', () => {
    expect(hashBody('{"a":1}')).toBe(hashBody('{"a":1}'));
    expect(hashBody('{"a":1}')).not.toBe(hashBody('{"a":2}'));
  });
});

describe('retries', () => {
  it('back off exponentially with jitter, up to 15 minutes', () => {
    expect(backoffMs(1, () => 1)).toBe(2_000);
    expect(backoffMs(1, () => 0)).toBe(1_000);
    expect(backoffMs(3, () => 1)).toBe(8_000);
    expect(backoffMs(30, () => 1)).toBe(15 * 60_000);
  });

  it('send after a quiet moment, or once a change has waited long enough', () => {
    expect(readyToSend([], 10_000)).toBe(false);
    expect(readyToSend([10_000], 10_000 + QUIET_MS - 1)).toBe(false);
    expect(readyToSend([10_000], 10_000 + QUIET_MS)).toBe(true);
    const typing = [0, MAX_WAIT_MS - 500];
    expect(readyToSend(typing, MAX_WAIT_MS)).toBe(true);
  });
});

describe('resolveConflict', () => {
  const base = { id: 'p', name: 'Plan', status: 'active', color: 'purple' };

  it('one side changed: that side wins', () => {
    const local = { payload: base, at: 1 };
    const remote = { payload: { ...base, name: 'Launch' }, at: 2 };
    expect(resolveConflict('project', base, local, remote)).toEqual({ action: 'take-remote' });
    expect(resolveConflict('project', base, remote, local)).toEqual({ action: 'send-local' });
  });

  it('small records merge field by field; a field both changed goes to the later edit', () => {
    const local = { payload: { ...base, name: 'Launch', color: 'blue' }, at: 10 };
    const remote = { payload: { ...base, status: 'done', color: 'green' }, at: 20 };
    expect(resolveConflict('project', base, local, remote)).toEqual({
      action: 'merge',
      payload: { id: 'p', name: 'Launch', status: 'done', color: 'green' },
    });
    expect(mergeFields(base, { ...local, at: 30 }, remote).color).toBe('blue');
  });

  it('written content edited on both Macs keeps both; nothing is overwritten', () => {
    const note = { id: 'n', doc_json: 'a' };
    const local = { payload: { ...note, doc_json: 'mine' }, at: 1 };
    const remote = { payload: { ...note, doc_json: 'theirs' }, at: 2 };
    expect(resolveConflict('note', note, local, remote)).toEqual({ action: 'keep-both' });
  });

  it('deleted on one side, edited on the other: written content keeps the edit', () => {
    const note = { id: 'n', doc_json: 'a' };
    const edited = { payload: { ...note, doc_json: 'b' }, at: 1 };
    const deleted = { payload: null, at: 5 };
    expect(resolveConflict('note', note, edited, deleted)).toEqual({ action: 'send-local' });
    expect(resolveConflict('note', note, deleted, edited)).toEqual({ action: 'take-remote' });
    // Small records: the later of the two.
    expect(resolveConflict('task', base, edited, deleted)).toEqual({ action: 'take-remote' });
  });

  it('a second Mac signing in: the cloud wins for small records, content keeps both', () => {
    const local = { payload: { ...base, name: 'Fresh default' }, at: 99 };
    const remote = { payload: base, at: 1 };
    expect(resolveConflict('space', null, local, remote)).toEqual({ action: 'take-remote' });
    expect(resolveConflict('note', null, local, remote)).toEqual({ action: 'keep-both' });
    expect(resolveConflict('note', null, local, { payload: null, at: 1 })).toEqual({
      action: 'send-local',
    });
  });

  it('identical on both sides: nothing to resolve', () => {
    expect(
      resolveConflict('note', null, { payload: base, at: 1 }, { payload: base, at: 2 }),
    ).toEqual({ action: 'take-remote' });
  });
});
