import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  downloadVoiceModel,
  fileMatches,
  modelDir,
  readModelFile,
} from '../../src/main/voice/model-files';
import type { VoiceModelFile } from '../../src/shared/voice';

const enc = new TextEncoder();
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const gitSha1 = (b: Uint8Array) =>
  createHash('sha1').update(`blob ${b.byteLength}\0`).update(b).digest('hex');

const big = enc.encode('pretend onnx weights '.repeat(100));
const small = enc.encode('{"model":"whisper"}');
const FILES = [
  { path: 'config.json', size: small.byteLength, gitSha1: gitSha1(small) },
  { path: 'onnx/encoder_model_quantized.onnx', size: big.byteLength, sha256: sha256(big) },
] as unknown as readonly VoiceModelFile[];

let root = '';
afterEach(() => rmSync(root, { recursive: true, force: true }));

const fetchFrom = (served: Record<string, Uint8Array>) => async (url: string) => {
  const name = Object.keys(served).find((k) => url.endsWith(`/${k}`));
  return name ? new Response(served[name]) : new Response(null, { status: 404 });
};

describe('the speech model download', () => {
  it('fetches each file at the pinned revision, checks it, and reports progress', async () => {
    root = mkdtempSync(join(tmpdir(), 'orbit-model-'));
    const urls: string[] = [];
    const progress: number[] = [];
    const serve = fetchFrom({ 'config.json': small, 'encoder_model_quantized.onnx': big });
    await downloadVoiceModel(root, {
      files: FILES,
      baseUrl: 'http://mirror/',
      onProgress: (p) => progress.push(p),
      fetchImpl: async (url) => {
        urls.push(url);
        return serve(url);
      },
    });
    expect(urls[0]).toMatch(
      /^http:\/\/mirror\/onnx-community\/whisper-base\/resolve\/[0-9a-f]{40}\/config\.json$/,
    );
    expect(readFileSync(join(modelDir(root), 'onnx/encoder_model_quantized.onnx'))).toEqual(
      Buffer.from(big),
    );
    expect(progress.at(-1)).toBe(1);
    // Already there: nothing is fetched again.
    urls.length = 0;
    await downloadVoiceModel(root, { files: FILES, fetchImpl: serve });
    expect(urls).toEqual([]);
  });

  it('refuses a file that doesn’t match its hash, and keeps nothing of it', async () => {
    root = mkdtempSync(join(tmpdir(), 'orbit-model-'));
    const tampered = enc.encode('{"model":"evilxx"}'.padEnd(small.byteLength, ' '));
    await expect(
      downloadVoiceModel(root, {
        files: FILES,
        fetchImpl: fetchFrom({ 'config.json': tampered, 'encoder_model_quantized.onnx': big }),
      }),
    ).rejects.toThrow(/didn’t check out/);
    expect(existsSync(join(modelDir(root), 'config.json'))).toBe(false);
    expect(fileMatches(FILES[0]!, small)).toBe(true);
    expect(fileMatches(FILES[0]!, tampered)).toBe(false);
  });

  it('gives the voice page only the model’s own files', async () => {
    root = mkdtempSync(join(tmpdir(), 'orbit-model-'));
    await expect(readModelFile(root, '../../../etc/passwd')).rejects.toThrow(/Not a speech model/);
    await expect(readModelFile(root, 'secrets.json')).rejects.toThrow(/Not a speech model/);
  });
});
