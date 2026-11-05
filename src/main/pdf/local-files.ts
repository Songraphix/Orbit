import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

/**
 * PDFs from this Mac (roadmap R2 M4), opened in tabs without opening up `file://`: each PDF you
 * open (⌘O, Finder, the Dock) gets a random address — `orbit-pdf://file/<token>/<name>` — and
 * only those files can be read through it. Web pages can't navigate there (Orbit's navigation
 * rules) and can't guess a token. The list is kept (tabs come back after a restart).
 */
export const PDF_SCHEME = 'orbit-pdf';

export type LocalPdf = { token: string; path: string; name: string };

export type LocalPdfStore = {
  get(): LocalPdf[];
  set(list: LocalPdf[]): void;
};

/** At most this many remembered PDFs (the oldest are forgotten). */
const KEEP = 300;

export class LocalPdfs {
  constructor(private readonly store: LocalPdfStore) {}

  /** A tab address for a PDF on this Mac (the same one again for the same file). */
  addressFor(path: string): string {
    if (extname(path).toLowerCase() !== '.pdf') throw new Error('Only PDF files open this way');
    const list = this.store.get();
    let entry = list.find((p) => p.path === path);
    if (!entry) {
      entry = { token: randomUUID(), path, name: basename(path) };
      this.store.set([entry, ...list].slice(0, KEEP));
    }
    return `${PDF_SCHEME}://file/${entry.token}/${encodeURIComponent(entry.name)}`;
  }

  /** The file behind an address, if it's one of ours and still there. */
  pathOf(address: string): LocalPdf | null {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return null;
    }
    if (url.protocol !== `${PDF_SCHEME}:` || url.hostname !== 'file') return null;
    const token = url.pathname.split('/')[1] ?? '';
    const entry = this.store.get().find((p) => p.token === token);
    return entry && existsSync(entry.path) && statSync(entry.path).isFile() ? entry : null;
  }

  /** The protocol handler: the file's bytes, or 404. */
  async respond(request: Request): Promise<Response> {
    const entry = this.pathOf(request.url);
    if (!entry) return new Response('Not found', { status: 404 });
    const bytes = await readFile(entry.path);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': String(bytes.byteLength) },
    });
  }
}
