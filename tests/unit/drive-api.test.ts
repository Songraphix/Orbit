import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DriveApi, DriveApiError } from '../../src/main/drive/api';

const PDF = readFileSync(join(import.meta.dirname, '../fixtures/two-pages.pdf'));

describe('DriveApi', () => {
  const calls: string[] = [];
  const api = new DriveApi(async (url, init) => {
    calls.push(url);
    const auth = (init?.headers as Record<string, string>)['authorization'];
    if (auth !== 'Bearer t')
      return new Response('{"error":{"message":"Invalid Credentials"}}', { status: 401 });
    if (url.includes('/export?')) return new Response('Doc text');
    if (url.includes('alt=media')) return new Response(PDF);
    return new Response(JSON.stringify({ files: [] }));
  }, 'https://drive.test');

  it('reads a PDF’s text, page by page', async () => {
    const read = await api.text('t', {
      id: 'p1',
      name: 'Plan.pdf',
      mimeType: 'application/pdf',
      modifiedTime: null,
      webViewLink: null,
      size: PDF.byteLength,
    });
    expect(read?.text).toContain('[Page 1]');
    expect(read?.text).toContain('teal and sand');
    expect(read?.text).toContain('[Page 2]');
    expect(calls.at(-1)).toBe(
      'https://drive.test/drive/v3/files/p1?alt=media&supportsAllDrives=true',
    );
  });

  it('exports Google Docs; refuses kinds it can’t read; says when Google refuses', async () => {
    const doc = {
      id: 'd',
      name: 'D',
      mimeType: 'application/vnd.google-apps.document',
      modifiedTime: null,
      webViewLink: null,
      size: null,
    };
    expect((await api.text('t', doc))?.text).toBe('Doc text');
    expect(await api.text('t', { ...doc, mimeType: 'image/png', size: 10 })).toBeNull();
    await expect(api.text('bad', doc)).rejects.toBeInstanceOf(DriveApiError);
  });

  it('searches with an escaped query, newest first when there are no words', async () => {
    await api.search('t', "it's");
    expect(new URL(calls.at(-1)!).searchParams.get('q')).toContain("name contains 'it\\'s'");
    await api.search('t', '');
    expect(calls.at(-1)).toContain('orderBy=modifiedTime+desc');
  });
});
