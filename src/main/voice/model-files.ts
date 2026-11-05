import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isModelFile, VOICE_MODEL, VOICE_MODEL_BYTES } from '@shared/voice';
import type { VoiceModelFile } from '@shared/voice';

/**
 * The speech model's files on this Mac (`<userData>/models/whisper-base/<revision>/`): fetched
 * once from Hugging Face at a pinned revision, each checked (size and hash) before it's kept.
 * No Electron imports: the fetch is injected.
 */

export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export function modelDir(root: string): string {
  return join(root, VOICE_MODEL.id, VOICE_MODEL.revision);
}

/** Every file is there at its expected size (a quick check; hashes were checked on download). */
export function voiceModelReady(root: string): boolean {
  const dir = modelDir(root);
  return VOICE_MODEL.files.every((f) => {
    try {
      return statSync(join(dir, f.path)).size === f.size;
    } catch {
      return false;
    }
  });
}

/** Whether downloaded bytes are the expected file. Pure. */
export function fileMatches(file: VoiceModelFile, bytes: Uint8Array): boolean {
  if (bytes.byteLength !== file.size) return false;
  if ('sha256' in file) return createHash('sha256').update(bytes).digest('hex') === file.sha256;
  // git's blob id: sha1 of "blob <size>\0" followed by the content.
  const hash = createHash('sha1');
  hash.update(`blob ${bytes.byteLength}\0`);
  hash.update(bytes);
  return hash.digest('hex') === file.gitSha1;
}

/**
 * Downloads whatever is missing, reporting progress (0–1 over the whole model). A file that
 * doesn't match its hash is discarded and the download fails.
 */
export async function downloadVoiceModel(
  root: string,
  options: {
    fetchImpl: Fetch;
    onProgress?: (share: number) => void;
    signal?: AbortSignal;
    /** Where the files come from (development/tests: a local mirror). */
    baseUrl?: string;
    /** The files (tests: a small stand-in model). */
    files?: readonly VoiceModelFile[];
  },
): Promise<void> {
  const dir = modelDir(root);
  const files = options.files ?? VOICE_MODEL.files;
  const total = files.reduce((sum, f) => sum + f.size, 0) || VOICE_MODEL_BYTES;
  const base = (options.baseUrl ?? 'https://huggingface.co').replace(/\/$/, '');
  let done = 0;
  for (const file of files) {
    const target = join(dir, file.path);
    if (existsSync(target) && statSync(target).size === file.size) {
      done += file.size;
      options.onProgress?.(done / total);
      continue;
    }
    const url = `${base}/${VOICE_MODEL.repo}/resolve/${VOICE_MODEL.revision}/${file.path}`;
    const response = await options.fetchImpl(url, { signal: options.signal });
    if (!response.ok || !response.body) {
      throw new Error(`The speech model couldn’t be downloaded (${response.status})`);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      chunks.push(value);
      received += value.byteLength;
      if (received > file.size)
        throw new Error('The speech model download was larger than expected');
      options.onProgress?.((done + received) / total);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (!fileMatches(file, bytes)) {
      throw new Error('The speech model download didn’t check out — try again');
    }
    mkdirSync(dirname(target), { recursive: true });
    const partial = `${target}.partial`;
    await writeFile(partial, bytes);
    await rename(partial, target);
    done += file.size;
  }
  options.onProgress?.(1);
}

/** One of the model's files, for the voice page (only those files; nothing else on disk). */
export async function readModelFile(root: string, path: string): Promise<Uint8Array> {
  if (!isModelFile(path)) throw new Error('Not a speech model file');
  const dir = modelDir(root);
  const full = resolve(dir, path);
  if (!full.startsWith(dir + sep)) throw new Error('Not a speech model file');
  return new Uint8Array(await readFile(full));
}

/** Removes the downloaded model (Settings → Voice → Remove). */
export async function removeVoiceModel(root: string): Promise<void> {
  await rm(join(root, VOICE_MODEL.id), { recursive: true, force: true });
}

/** Synchronous variant for tests and quitting. */
export function removeVoiceModelSync(root: string): void {
  rmSync(join(root, VOICE_MODEL.id), { recursive: true, force: true });
}
