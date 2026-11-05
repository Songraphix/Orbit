import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalPdfs } from '../../src/main/pdf/local-files';
import type { LocalPdf } from '../../src/main/pdf/local-files';

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
  dir = mkdtempSync(join(tmpdir(), 'orbit-pdfs-'));
  const file = join(dir, 'Brand guide.pdf');
  copyFileSync(join(import.meta.dirname, '../fixtures/two-pages.pdf'), file);
  let saved: LocalPdf[] = [];
  const pdfs = new LocalPdfs({ get: () => saved, set: (list) => (saved = list) });
  return { pdfs, file, saved: () => saved };
}

describe('LocalPdfs', () => {
  it('gives each PDF one random address and serves only those files', async () => {
    const { pdfs, file } = setup();
    const address = pdfs.addressFor(file);
    expect(address).toMatch(/^orbit-pdf:\/\/file\/[0-9a-f-]{36}\/Brand%20guide\.pdf$/);
    expect(pdfs.addressFor(file)).toBe(address);
    const ok = await pdfs.respond(new Request(address));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await ok.arrayBuffer()).slice(0, 4)).toEqual(
      new TextEncoder().encode('%PDF'),
    );
    const guessed = address.replace(
      /file\/[0-9a-f-]{36}/,
      'file/00000000-0000-0000-0000-000000000000',
    );
    expect((await pdfs.respond(new Request(guessed))).status).toBe(404);
  });

  it('refuses anything that isn’t a PDF', () => {
    const { pdfs } = setup();
    expect(() => pdfs.addressFor('/etc/passwd')).toThrow(/Only PDF/);
  });

  it('forgets a file that’s gone', async () => {
    const { pdfs, file } = setup();
    const address = pdfs.addressFor(file);
    rmSync(file);
    expect((await pdfs.respond(new Request(address))).status).toBe(404);
  });
});
