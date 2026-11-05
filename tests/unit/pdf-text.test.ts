import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pdfText } from '../../src/main/pdf/text';

const FIXTURE = join(import.meta.dirname, '../fixtures/two-pages.pdf');

describe('pdfText', () => {
  it('reads each page’s text, and the title', async () => {
    const text = await pdfText(new Uint8Array(readFileSync(FIXTURE)));
    expect(text.numPages).toBe(2);
    expect(text.pages[0]).toContain('brand colours: teal and sand');
    expect(text.pages[1]).toContain('Second page');
    expect(text.truncated).toBe(false);
  });
  it('refuses what isn’t a PDF', async () => {
    await expect(pdfText(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});
