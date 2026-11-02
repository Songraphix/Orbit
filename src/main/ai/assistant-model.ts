import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaRequestDocumentBlock,
  BetaTextCitation,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AssistantContext, AssistantPart, AssistantSource } from '@shared/assistant';
import { hostOf } from '@shared/capture';

/**
 * The assistant's pure parts (roadmap P3.1–P3.4): pages and research become documents Claude
 * can cite, streamed answers become text with numbered sources, and the conversation becomes
 * the next request. No Electron here.
 */

/** A readable piece of a page: a heading, paragraph, list item, quote, code block or cell. */
export type PagePassage = { kind: 'heading' | 'text' | 'item' | 'quote' | 'code'; text: string };

/** What the page reader (an isolated-world script) returns. */
export type ExtractedPage = {
  title: string;
  url: string;
  description: string;
  site: string;
  passages: PagePassage[];
  /** The page was longer than Orbit reads: only the first part was kept. */
  truncated: boolean;
  /** Each passage is tied to its element on the page, so a citation can scroll to it. */
  anchored: boolean;
};

/** Pages are read up to this many characters (about 30,000 tokens). */
export const PAGE_CHAR_LIMIT = 120_000;

/** A document in the conversation: what Claude saw, and where its citations lead back to. */
export type ConversationDoc =
  | {
      kind: 'page';
      title: string;
      url: string;
      passages: PagePassage[];
      truncated: boolean;
      /** The tab it came from and whether its passages can be scrolled to. */
      tabId: string;
      anchored: boolean;
      /** Same page, same words: not attached twice. */
      key: string;
    }
  | { kind: 'selection'; title: string; url: string; text: string; key: string }
  | {
      /** A project the user shared: its brief, tasks and notes (brief M8). */
      kind: 'project';
      title: string;
      url: string;
      text: string;
      projectId: string;
      key: string;
    }
  | {
      kind: 'research';
      title: string;
      url: string;
      text: string;
      captureId: string;
      context: string;
      key: string;
    };

/** Where a numbered source leads: a passage of a page, or words in a selection/finding. */
export type SourceTarget = {
  doc: number;
  /** Page passages cited (start, end exclusive). */
  block: number | null;
  /** Characters cited in a selection or finding. */
  start: number | null;
  end: number | null;
  quote: string;
};

/** A cheap fingerprint for "is this the same text as before". */
export function textKey(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x0a;
  }
  return `${parts.length}:${(hash >>> 0).toString(36)}`;
}

/** Trims passages to the character limit, saying whether anything was cut. Pure. */
export function limitPassages(
  passages: readonly PagePassage[],
  limit = PAGE_CHAR_LIMIT,
): { passages: PagePassage[]; truncated: boolean } {
  const kept: PagePassage[] = [];
  let total = 0;
  for (const passage of passages) {
    const text = passage.text.trim();
    if (!text) continue;
    if (total + text.length > limit) return { passages: kept, truncated: true };
    kept.push({ kind: passage.kind, text });
    total += text.length;
  }
  return { passages: kept, truncated: false };
}

/** Clips text to `max` characters at a word, with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const passageText = (p: PagePassage) =>
  p.kind === 'heading' ? `# ${p.text}` : p.kind === 'item' ? `• ${p.text}` : p.text;

/** A conversation document as the API takes it: citations on, untrusted content labelled. */
export function documentBlock(doc: ConversationDoc): BetaRequestDocumentBlock {
  const base = { type: 'document' as const, citations: { enabled: true } };
  if (doc.kind === 'page') {
    return {
      ...base,
      title: clip(doc.title || hostOf(doc.url) || 'Page', 300),
      context:
        `A web page the user chose to share: ${doc.url}` +
        (doc.truncated ? '. Only its first part was read (the page is long).' : '.'),
      // One block per passage, so a citation names the passage (and Orbit can scroll to it).
      source: {
        type: 'content',
        content: doc.passages.map((p) => ({ type: 'text' as const, text: passageText(p) })),
      },
    };
  }
  if (doc.kind === 'selection') {
    return {
      ...base,
      title: clip(`Selected text from ${doc.title || hostOf(doc.url)}`, 300),
      context: `Text the user selected on ${doc.url}.`,
      source: { type: 'text', media_type: 'text/plain', data: doc.text },
    };
  }
  if (doc.kind === 'project') {
    return {
      ...base,
      title: clip(`Project: ${doc.title}`, 300),
      context:
        'One of the user’s own projects in Orbit, which they chose to share: its brief, tasks and linked notes.',
      source: { type: 'text', media_type: 'text/plain', data: doc.text },
    };
  }
  return {
    ...base,
    title: clip(doc.title || 'Saved finding', 300),
    context: doc.context,
    source: { type: 'text', media_type: 'text/plain', data: doc.text },
  };
}

/** What a question goes with, as the conversation shows it. */
export function contextLabel(doc: ConversationDoc): AssistantContext {
  const host = hostOf(doc.url);
  if (doc.kind === 'page') {
    return { kind: 'page', label: clip(doc.title || host || 'Page', 80), partial: doc.truncated };
  }
  if (doc.kind === 'selection') {
    return { kind: 'selection', label: `Selection · ${host || 'page'}`, partial: false };
  }
  if (doc.kind === 'project') {
    return { kind: 'project', label: clip(`Project · ${doc.title}`, 80), partial: false };
  }
  return { kind: 'research', label: clip(doc.title || host || 'Finding', 80), partial: false };
}

/** One turn of the conversation, as main keeps it. */
export type Turn = {
  /** What was sent (a summary request says more than the "Summarize this page" you see). */
  prompt: string;
  /** Documents attached with this question, by index in the conversation's list. */
  docs: number[];
  /** The answer's text so far (empty while thinking or after an error): after any tool rounds,
   *  the last message's text. */
  answer: string;
  /** Tool rounds within this answer (Claude's tool calls and their results), replayed in later
   *  requests so Claude remembers what it looked at and did. */
  exchange?: BetaMessageParam[];
};

/**
 * The request for the next answer: every turn so far, each question with the documents attached
 * to it (in order, so citation numbers match the conversation's list), each answer as text.
 */
export function apiMessages(turns: readonly Turn[], docs: readonly ConversationDoc[]) {
  const messages: BetaMessageParam[] = [];
  for (const turn of turns) {
    messages.push({
      role: 'user',
      content: [
        ...turn.docs.map((i) => documentBlock(docs[i]!)),
        { type: 'text', text: turn.prompt },
      ],
    });
    // Tool rounds go back only with the answer that followed them (a call must have its result,
    // and the conversation must end each turn with Claude).
    if (turn.answer.trim()) {
      if (turn.exchange) messages.push(...turn.exchange);
      messages.push({ role: 'assistant', content: turn.answer });
    }
  }
  return messages;
}

/** Documents are numbered across the whole request, in the order they appear. */
export function requestDocOrder(turns: readonly Turn[]): number[] {
  return turns.flatMap((t) => t.docs);
}

type TextAcc = { text: string; citations: BetaTextCitation[] };

/** Collects a streamed answer: its text blocks and their citations, by block index. */
export class ReplyBuilder {
  private readonly blocks = new Map<number, TextAcc>();

  apply(event: BetaRawMessageStreamEvent): boolean {
    if (event.type === 'content_block_start' && event.content_block.type === 'text') {
      this.blocks.set(event.index, {
        text: event.content_block.text,
        citations: [...(event.content_block.citations ?? [])],
      });
      return true;
    }
    if (event.type !== 'content_block_delta') return false;
    const block = this.blocks.get(event.index);
    if (!block) return false;
    if (event.delta.type === 'text_delta') block.text += event.delta.text;
    else if (event.delta.type === 'citations_delta') block.citations.push(event.delta.citation);
    else return false;
    return true;
  }

  /** The text blocks in order. */
  texts(): TextAcc[] {
    return [...this.blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
  }

  get started(): boolean {
    return this.blocks.size > 0;
  }
}

/**
 * Text blocks → answer parts with numbered sources. A source is numbered when first cited; the
 * same passage cited again keeps its number. `order` maps a citation's document_index (its
 * place in the request) to the conversation's document list.
 */
export function buildReply(
  blocks: readonly TextAcc[],
  docs: readonly ConversationDoc[],
  order: readonly number[],
): { parts: AssistantPart[]; sources: AssistantSource[]; targets: SourceTarget[]; text: string } {
  const parts: AssistantPart[] = [];
  const sources: AssistantSource[] = [];
  const targets: SourceTarget[] = [];
  const numbers = new Map<string, number>();
  for (const block of blocks) {
    const cites: number[] = [];
    for (const citation of block.citations) {
      const target = targetOf(citation, order);
      if (!target) continue;
      const doc = docs[target.doc];
      if (!doc) continue;
      const key = `${target.doc}:${target.block ?? ''}:${target.start ?? ''}`;
      let n = numbers.get(key);
      if (n === undefined) {
        n = sources.length + 1;
        numbers.set(key, n);
        sources.push({
          n,
          kind: doc.kind,
          title: clip(doc.title || hostOf(doc.url) || 'Source', 120),
          host: hostOf(doc.url),
          quote: clip(target.quote, 400),
        });
        targets.push(target);
      }
      if (!cites.includes(n)) cites.push(n);
    }
    const last = parts.at(-1);
    // Uncited runs join up; cited ones keep their own numbers.
    if (last && cites.length === 0 && last.cites.length === 0) last.text += block.text;
    else parts.push({ text: block.text, cites });
  }
  return { parts, sources, targets, text: blocks.map((b) => b.text).join('') };
}

function targetOf(citation: BetaTextCitation, order: readonly number[]): SourceTarget | null {
  const quote = 'cited_text' in citation ? String(citation.cited_text) : '';
  if (citation.type === 'content_block_location') {
    const doc = order[citation.document_index];
    if (doc === undefined) return null;
    return { doc, block: citation.start_block_index, start: null, end: null, quote };
  }
  if (citation.type === 'char_location') {
    const doc = order[citation.document_index];
    if (doc === undefined) return null;
    return {
      doc,
      block: null,
      start: citation.start_char_index,
      end: citation.end_char_index,
      quote,
    };
  }
  return null;
}

/** A link that opens a finding's page at the cited words (a text fragment). */
export function fragmentUrl(url: string, quote: string): string {
  const words = quote.replace(/\s+/g, ' ').trim();
  if (!/^https?:\/\//i.test(url) || words.length < 4) return url;
  const base = url.split('#')[0]!;
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');
  const all = words.split(' ');
  // Long quotes: the first and last few words (textStart,textEnd).
  const directive =
    all.length > 10
      ? `${enc(all.slice(0, 4).join(' '))},${enc(all.slice(-4).join(' '))}`
      : enc(words);
  return `${base}#:~:text=${directive}`;
}

/** The activity log's description of what a question sent. */
export function describeSent(docs: readonly ConversationDoc[], prompt: string): string {
  const parts = docs.map((doc) => {
    const host = hostOf(doc.url);
    if (doc.kind === 'page') {
      const chars = doc.passages.reduce((n, p) => n + p.text.length, 0);
      return `Page “${clip(doc.title, 60)}” (${host}, ${chars.toLocaleString('en-US')} characters)`;
    }
    if (doc.kind === 'selection')
      return `Selected text from ${host} (${doc.text.length} characters)`;
    if (doc.kind === 'project')
      return `Project “${clip(doc.title, 40)}” (${doc.text.length.toLocaleString('en-US')} characters)`;
    return `Finding “${clip(doc.title, 40)}”`;
  });
  const findings = parts.filter((p) => p.startsWith('Finding')).length;
  const listed =
    findings > 2
      ? [...parts.filter((p) => !p.startsWith('Finding')), `${findings} saved findings`]
      : parts;
  return [...listed, prompt ? 'your question' : ''].filter(Boolean).join(', ');
}
