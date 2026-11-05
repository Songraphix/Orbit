import { describe, expect, it } from 'vitest';
import {
  citeMarker,
  inlineText,
  parseInline,
  parseMarkdown,
  plainText,
  safeHref,
} from '@shared/markdown';

describe('Markdown for answers', () => {
  it('reads headings, paragraphs, rules and code blocks', () => {
    const blocks = parseMarkdown(
      '# Title\n\nSome words\nmore words.\n\n---\n\n```ts\nconst a = 1;\n```',
    );
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'paragraph', 'rule', 'code']);
    expect(blocks[3]).toEqual({ t: 'code', lang: 'ts', v: 'const a = 1;' });
    expect(plainText(blocks)).toContain('Some words\nmore words.');
  });

  it('reads nested and ordered lists', () => {
    const [list] = parseMarkdown('- one\n- two\n  - two a\n  - two b\n- three');
    expect(list?.t).toBe('list');
    if (list?.t !== 'list') return;
    expect(list.items).toHaveLength(3);
    expect(list.items[1]!.map((b) => b.t)).toEqual(['paragraph', 'list']);
    const [ordered] = parseMarkdown('3. c\n4. d');
    expect(ordered).toMatchObject({ t: 'list', ordered: true, start: 3 });
  });

  it('reads tables and quotes', () => {
    const blocks = parseMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n\n> quoted **bold**');
    expect(blocks[0]).toMatchObject({ t: 'table' });
    if (blocks[0]?.t === 'table') {
      expect(blocks[0].head.map(inlineText)).toEqual(['A', 'B']);
      expect(blocks[0].rows[0]!.map(inlineText)).toEqual(['1', '2']);
    }
    expect(blocks[1]).toMatchObject({ t: 'quote' });
  });

  it('reads emphasis, code and links, keeping only safe links', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'strong', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'd' },
    ]);
    expect(parseInline('[site](https://example.com)')).toEqual([
      { t: 'link', href: 'https://example.com', c: [{ t: 'text', v: 'site' }] },
    ]);
    // A javascript: link is just its words.
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ t: 'text', v: 'x' }]);
    expect(safeHref('file:///etc/passwd')).toBeNull();
    // snake_case isn't emphasis; bare links are links.
    expect(inlineText(parseInline('use snake_case_names'))).toBe('use snake_case_names');
    expect(parseInline('see https://a.dev/x.')[1]).toMatchObject({
      t: 'link',
      href: 'https://a.dev/x',
    });
  });

  it('turns citation markers into cite nodes', () => {
    const nodes = parseInline(`Grids help.${citeMarker([1, 2])} Next.`);
    expect(nodes).toEqual([
      { t: 'text', v: 'Grids help.' },
      { t: 'cite', n: [1, 2] },
      { t: 'text', v: ' Next.' },
    ]);
    expect(inlineText(nodes)).toBe('Grids help. Next.');
  });
});

describe('appendMarkdown', () => {
  it('adds to the end of a note, keeping what was there', async () => {
    const { appendMarkdown, noteFromMarkdown } = await import('../../src/main/notes/from-markdown');
    const first = noteFromMarkdown('Notes · Brand guide.pdf', 'On Brand guide.pdf (on this Mac)');
    const next = appendMarkdown(first.doc, first.text, '> teal and sand');
    const doc = JSON.parse(next.doc) as { content: { type: string }[] };
    expect(doc.content.map((n) => n.type)).toEqual(['heading', 'paragraph', 'blockquote']);
    expect(next.text).toContain('teal and sand');
    expect(next.text.startsWith('Notes · Brand guide.pdf')).toBe(true);
    expect(JSON.parse(appendMarkdown('not json', '', 'x').doc).content).toHaveLength(1);
  });
});
