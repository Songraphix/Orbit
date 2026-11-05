import { inlineText, parseMarkdown, plainText } from '@shared/markdown';
import type { Block, Inline } from '@shared/markdown';

/**
 * Writes Markdown (an assistant answer, a selection) as a note: the editor's own document JSON
 * (Tiptap's StarterKit nodes and marks), so it opens as an ordinary, editable note. Pure.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Mark[];
};

const LINK_ATTRS = { target: '_blank', rel: 'noopener noreferrer nofollow', class: null };

function inlines(nodes: readonly Inline[], marks: Mark[] = []): PMNode[] {
  const out: PMNode[] = [];
  const text = (value: string, with_: Mark[]) => {
    if (!value) return;
    out.push(
      with_.length ? { type: 'text', text: value, marks: with_ } : { type: 'text', text: value },
    );
  };
  for (const node of nodes) {
    if (node.t === 'text') text(node.v, marks);
    else if (node.t === 'code') text(node.v, [...marks, { type: 'code' }]);
    else if (node.t === 'cite') text(` [${node.n.join(', ')}]`, marks);
    else if (node.t === 'strong') out.push(...inlines(node.c, [...marks, { type: 'bold' }]));
    else if (node.t === 'em') out.push(...inlines(node.c, [...marks, { type: 'italic' }]));
    else
      out.push(
        ...inlines(node.c, [...marks, { type: 'link', attrs: { href: node.href, ...LINK_ATTRS } }]),
      );
  }
  return out;
}

const withContent = (type: string, content: PMNode[], attrs?: Record<string, unknown>): PMNode => ({
  type,
  ...(attrs ? { attrs } : {}),
  ...(content.length ? { content } : {}),
});

function blocks(list: readonly Block[]): PMNode[] {
  const out: PMNode[] = [];
  for (const block of list) {
    switch (block.t) {
      case 'heading':
        out.push(withContent('heading', inlines(block.c), { level: block.level }));
        break;
      case 'paragraph':
        out.push(withContent('paragraph', inlines(block.c)));
        break;
      case 'code':
        out.push(
          withContent('codeBlock', block.v ? [{ type: 'text', text: block.v }] : [], {
            language: block.lang || null,
          }),
        );
        break;
      case 'quote':
        out.push(withContent('blockquote', blocks(block.c)));
        break;
      case 'rule':
        out.push({ type: 'horizontalRule' });
        break;
      case 'table':
        // Notes have no tables: one line per row.
        for (const row of [block.head, ...block.rows]) {
          out.push(
            withContent('paragraph', [{ type: 'text', text: row.map(inlineText).join(' · ') }]),
          );
        }
        break;
      case 'list':
        out.push(
          withContent(
            block.ordered ? 'orderedList' : 'bulletList',
            block.items.map((item) => {
              const content = blocks(item);
              // A list item starts with a paragraph.
              if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
              return withContent('listItem', content);
            }),
            block.ordered ? { start: block.start } : undefined,
          ),
        );
        break;
    }
  }
  return out;
}

export type NoteSource = { n: number; title: string; url: string; quote: string };

/** A note from a title, a Markdown body and (optionally) numbered sources. */
export function noteFromMarkdown(
  title: string,
  markdown: string,
  sources: readonly NoteSource[] = [],
): { doc: string; text: string } {
  const body = parseMarkdown(markdown);
  const content: PMNode[] = [
    withContent('heading', title ? [{ type: 'text', text: title }] : [], { level: 1 }),
    ...blocks(body),
  ];
  const lines = [title, plainText(body)];
  if (sources.length) {
    content.push(withContent('heading', [{ type: 'text', text: 'Sources' }], { level: 2 }));
    content.push(
      withContent(
        'orderedList',
        sources.map((source) =>
          withContent('listItem', [
            withContent('paragraph', [
              /^https?:\/\//i.test(source.url)
                ? {
                    type: 'text',
                    text: source.title || source.url,
                    marks: [{ type: 'link', attrs: { href: source.url, ...LINK_ATTRS } }],
                  }
                : { type: 'text', text: source.title || 'Source' },
              ...(source.quote ? [{ type: 'text', text: ` — “${source.quote}”` }] : []),
            ]),
          ]),
        ),
        { start: 1 },
      ),
    );
    lines.push('Sources', ...sources.map((s) => `${s.n}. ${s.title} — ${s.quote}`));
  }
  return { doc: JSON.stringify({ type: 'doc', content }), text: lines.filter(Boolean).join('\n') };
}

/** Adds Markdown to the end of a saved note (its doc JSON and text); a bad doc starts afresh. */
export function appendMarkdown(
  doc: string,
  text: string,
  markdown: string,
): { doc: string; text: string } {
  const body = parseMarkdown(markdown);
  let content: PMNode[];
  try {
    const parsed = JSON.parse(doc) as { content?: PMNode[] };
    content = Array.isArray(parsed.content) ? parsed.content : [];
  } catch {
    content = [];
  }
  return {
    doc: JSON.stringify({ type: 'doc', content: [...content, ...blocks(body)] }),
    text: [text, plainText(body)].filter(Boolean).join('\n'),
  };
}
