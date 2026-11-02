import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  apiMessages,
  buildReply,
  clip,
  describeSent,
  documentBlock,
  fragmentUrl,
  limitPassages,
  ReplyBuilder,
  requestDocOrder,
  textKey,
} from '../../src/main/ai/assistant-model';
import type { ConversationDoc, Turn } from '../../src/main/ai/assistant-model';
import { cleanSuggestions } from '@shared/assistant';
import { INTERNAL_EVENTS } from '@shared/ipc/contract';
import { estimateCost, formatCost, monthKey, withinBudget, DEFAULT_AI_PREFS } from '@shared/ai';

const page: ConversationDoc = {
  kind: 'page',
  title: 'Grid systems',
  url: 'https://example.com/grids',
  passages: [
    { kind: 'heading', text: 'Grids' },
    { kind: 'text', text: 'Grids give rhythm.' },
    { kind: 'item', text: 'Use an 8 pt baseline.' },
  ],
  truncated: false,
  tabId: 't1',
  anchored: true,
  key: 'k1',
};
const finding: ConversationDoc = {
  kind: 'research',
  title: 'Type scale',
  url: 'https://type.example/scale',
  text: 'A modular scale of 1.25 works well for body copy.',
  captureId: 'c1',
  context: 'Saved from https://type.example/scale',
  key: 'capture:c1',
};

describe('assistant documents', () => {
  it('sends a page as citable passages and a finding as plain text', () => {
    const block = documentBlock(page);
    expect(block.citations).toEqual({ enabled: true });
    expect(block.source).toEqual({
      type: 'content',
      content: [
        { type: 'text', text: '# Grids' },
        { type: 'text', text: 'Grids give rhythm.' },
        { type: 'text', text: '• Use an 8 pt baseline.' },
      ],
    });
    expect(block.context).toContain('https://example.com/grids');
    expect(documentBlock(finding).source).toMatchObject({ type: 'text', media_type: 'text/plain' });
  });

  it('limits long pages and says so', () => {
    const passages = Array.from({ length: 5 }, () => ({
      kind: 'text' as const,
      text: 'x'.repeat(40),
    }));
    expect(limitPassages(passages, 100)).toMatchObject({ truncated: true });
    expect(limitPassages(passages, 100).passages).toHaveLength(2);
    expect(limitPassages(passages, 1000).truncated).toBe(false);
  });

  it('builds the request: documents with the question they came with, answers as text', () => {
    const turns: Turn[] = [
      { prompt: 'Summarize', docs: [0], answer: 'It is about grids.' },
      { prompt: 'And type?', docs: [1], answer: '' },
    ];
    const messages = apiMessages(turns, [page, finding]);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(requestDocOrder(turns)).toEqual([0, 1]);
    const last = messages[2]!.content as { type: string }[];
    expect(last.map((b) => b.type)).toEqual(['document', 'text']);
  });
});

describe('streamed answers', () => {
  const events: BetaRawMessageStreamEvent[] = [
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'text', text: 'The page says ', citations: null },
    },
    {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'text', text: '', citations: null },
    },
    {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'text_delta', text: 'grids give rhythm' },
    },
    {
      type: 'content_block_delta',
      index: 2,
      delta: {
        type: 'citations_delta',
        citation: {
          type: 'content_block_location',
          cited_text: 'Grids give rhythm.',
          document_index: 0,
          document_title: 'Grid systems',
          start_block_index: 1,
          end_block_index: 2,
        },
      },
    },
    {
      type: 'content_block_start',
      index: 3,
      content_block: { type: 'text', text: ' and scales help.', citations: null },
    },
    {
      type: 'content_block_delta',
      index: 3,
      delta: {
        type: 'citations_delta',
        citation: {
          type: 'char_location',
          cited_text: 'A modular scale',
          document_index: 1,
          document_title: 'Type scale',
          start_char_index: 0,
          end_char_index: 15,
          file_id: null,
        },
      },
    },
  ] as BetaRawMessageStreamEvent[];

  it('numbers sources in order and keeps where they lead', () => {
    const builder = new ReplyBuilder();
    for (const event of events) builder.apply(event);
    const reply = buildReply(builder.texts(), [page, finding], [0, 1]);
    expect(reply.text).toBe('The page says grids give rhythm and scales help.');
    expect(reply.parts).toEqual([
      { text: 'The page says ', cites: [] },
      { text: 'grids give rhythm', cites: [1] },
      { text: ' and scales help.', cites: [2] },
    ]);
    expect(reply.sources.map((s) => [s.n, s.kind, s.host])).toEqual([
      [1, 'page', 'example.com'],
      [2, 'research', 'type.example'],
    ]);
    expect(reply.targets[0]).toMatchObject({ doc: 0, block: 1 });
    expect(reply.targets[1]).toMatchObject({ doc: 1, start: 0, end: 15 });
  });

  it('maps a citation through the request order (documents from earlier turns)', () => {
    const builder = new ReplyBuilder();
    for (const event of events) builder.apply(event);
    // The request held the finding first, then the page.
    const reply = buildReply(builder.texts(), [page, finding], [1, 0]);
    expect(reply.sources.map((s) => s.kind)).toEqual(['research', 'page']);
  });
});

describe('small helpers', () => {
  it('links to cited words with a text fragment', () => {
    expect(fragmentUrl('https://a.dev/p#top', 'grid rhythm')).toBe(
      'https://a.dev/p#:~:text=grid%20rhythm',
    );
    expect(
      fragmentUrl('https://a.dev/p', 'one two three four five six seven eight nine ten eleven'),
    ).toBe('https://a.dev/p#:~:text=one%20two%20three%20four,eight%20nine%20ten%20eleven');
    expect(fragmentUrl('orbit://notes', 'grid rhythm')).toBe('orbit://notes');
  });

  it('describes what was sent without the words themselves', () => {
    const sent = describeSent([page], 'What is this?');
    expect(sent).toBe('Page “Grid systems” (example.com, 44 characters), your question');
    expect(sent).not.toContain('rhythm');
  });

  it('clips at a word, fingerprints text', () => {
    expect(clip('one two three four', 10)).toBe('one two…');
    expect(textKey(['a', 'b'])).toBe(textKey(['a', 'b']));
    expect(textKey(['a', 'b'])).not.toBe(textKey(['ab']));
  });

  it('tidies task suggestions', () => {
    expect(
      cleanSuggestions([
        { title: '  Call  Sam ', notes: ' re: brief ' },
        { title: 'call sam', notes: '' },
        { title: '', notes: 'nothing' },
      ]),
    ).toEqual([{ title: 'Call Sam', notes: 're: brief' }]);
  });
});

describe('AI usage and limits', () => {
  it('estimates cost per model, cache included', () => {
    expect(estimateCost('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4);
    expect(
      estimateCost('claude-haiku-5-5', {
        input_tokens: 0,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
      }),
    ).toBeCloseTo(0.51);
    // An unknown (fallback) model is priced high, to be safe.
    expect(estimateCost('claude-opus-4-8', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(5);
  });

  it('formats dollars and checks the monthly limit', () => {
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(0.0042)).toBe('$0.004');
    expect(formatCost(0.00002)).toBe('<$0.001');
    expect(formatCost(3.4)).toBe('$3.40');
    expect(withinBudget(DEFAULT_AI_PREFS, 9.99)).toBe(true);
    expect(withinBudget(DEFAULT_AI_PREFS, 10)).toBe(false);
    expect(withinBudget({ ...DEFAULT_AI_PREFS, monthlyBudget: null }, 1e6)).toBe(true);
    expect(monthKey(new Date(2026, 10, 30).getTime())).toBe('2026-11');
  });
});

describe('internal page events', () => {
  it('the internal preload allows exactly the contract’s internal events', () => {
    const source = readFileSync(new URL('../../src/preload/internal.ts', import.meta.url), 'utf8');
    const list = /const EVENTS = new Set\(\[([^\]]*)\]\)/.exec(source)?.[1] ?? '';
    const allowed = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(allowed).toEqual([...INTERNAL_EVENTS]);
  });
});
