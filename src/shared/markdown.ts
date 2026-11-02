/**
 * A small Markdown reader for Claude's answers (roadmap P3.1): headings, paragraphs, lists,
 * quotes, code, tables, emphasis, inline code and links — plus citation markers Orbit inserts.
 * It builds a tree (never HTML), so the renderer draws it as React elements and Notes can turn
 * it into a note; only http(s) and mailto links survive. Pure.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  /** Sources cited here (numbers from 1). */
  | { t: 'cite'; n: number[] };

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'paragraph'; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'rule' };

/** Citation markers: CITE_OPEN + "1,2" + CITE_CLOSE, placed after the words they support. */
export const CITE_OPEN = '';
export const CITE_CLOSE = '';
export const citeMarker = (numbers: readonly number[]) =>
  numbers.length ? `${CITE_OPEN}${numbers.join(',')}${CITE_CLOSE}` : '';

export function safeHref(href: string): string | null {
  const trimmed = href.trim().replace(/^<|>$/g, '');
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.length - line.trimStart().length;
const isBlank = (line: string) => line.trim() === '';
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => parseInline(cell.trim()));

/** Whether a line starts a block other than a paragraph. */
function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line) ||
    (line.includes('|') && next !== undefined && TABLE_RULE.test(next))
  );
}

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function parseBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) body.push(lines[i++]!);
      i++; // the closing fence (or the end)
      blocks.push({ t: 'code', lang: fence[2] ?? '', v: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1]!.length) as 1 | 2 | 3;
      blocks.push({ t: 'heading', level, c: parseInline(heading[2]!) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ t: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) inner.push(QUOTE.exec(lines[i++]!)![1]!);
      blocks.push({ t: 'quote', c: parseBlocks(inner) });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!)) {
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && !isBlank(lines[i]!)) {
        rows.push(cells(lines[i++]!));
      }
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (ITEM.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]!)) {
      if (para.length > 0 && startsBlock(lines[i]!, lines[i + 1])) break;
      para.push(lines[i++]!.trim());
    }
    blocks.push({ t: 'paragraph', c: parseInline(para.join('\n')) });
  }
  return blocks;
}

/** A list starting at line `start`: its items, with nested lists and continuation lines. */
function parseList(lines: readonly string[], start: number): [Block, number] {
  const first = ITEM.exec(lines[start]!)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  const items: Block[][] = [];
  let i = start;
  while (i < lines.length) {
    const match = ITEM.exec(lines[i]!);
    if (!match || match[1]!.length !== base || /\d/.test(match[2]!) !== ordered) break;
    const body: string[] = [match[3]!];
    i++;
    // The item's other lines: indented deeper, or plain lines right after it.
    while (i < lines.length) {
      const line = lines[i]!;
      if (isBlank(line)) {
        const next = lines[i + 1];
        if (next !== undefined && !isBlank(next) && indentOf(next) > base) {
          body.push('');
          i++;
          continue;
        }
        break;
      }
      const item = ITEM.exec(line);
      if (item && item[1]!.length <= base) break;
      if (!item && indentOf(line) <= base && startsBlock(line, lines[i + 1])) break;
      body.push(indentOf(line) > base ? line.slice(Math.min(indentOf(line), base + 4)) : line);
      i++;
    }
    items.push(parseBlocks(body));
  }
  const startNumber = ordered ? Number.parseInt(first[2]!, 10) || 1 : 1;
  return [{ t: 'list', ordered, start: startNumber, items }, i];
}

const ESCAPABLE = /[\\`*_[\]()#+\-.!>~|{}]/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '\\' && i + 1 < source.length && ESCAPABLE.test(source[i + 1]!)) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === CITE_OPEN) {
      const end = source.indexOf(CITE_CLOSE, i);
      if (end > i) {
        const n = source
          .slice(i + 1, end)
          .split(',')
          .map(Number)
          .filter((x) => Number.isInteger(x) && x > 0);
        flush();
        if (n.length) out.push({ t: 'cite', n });
        i = end + 1;
        continue;
      }
    }
    if (ch === '`') {
      const run = /^`+/.exec(source.slice(i))![0];
      const end = source.indexOf(run, i + run.length);
      if (end > -1) {
        flush();
        out.push({ t: 'code', v: source.slice(i + run.length, end).trim() });
        i = end + run.length;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const wordInside = ch === '_' && i > 0 && /\w/.test(source[i - 1]!);
      if (!wordInside) {
        const double = source.startsWith(ch + ch, i);
        const marker = double ? ch + ch : ch;
        const from = i + marker.length;
        const end = closingMarker(source, marker, from);
        if (end > from && source[from] !== ' ') {
          flush();
          const inner = parseInline(source.slice(from, end));
          out.push(double ? { t: 'strong', c: inner } : { t: 'em', c: inner });
          i = end + marker.length;
          continue;
        }
      }
    }
    if (ch === '[') {
      const close = closingBracket(source, i);
      if (close > -1 && source[close + 1] === '(') {
        const end = closingParen(source, close + 1);
        if (end > -1) {
          const href = safeHref(
            source
              .slice(close + 2, end)
              .trim()
              .split(/\s+/)[0] ?? '',
          );
          const label = parseInline(source.slice(i + 1, close));
          flush();
          if (href) out.push({ t: 'link', href, c: label });
          else out.push(...label); // an unsafe or relative link: just its words
          i = end + 1;
          continue;
        }
      }
    }
    if (ch === 'h' && (i === 0 || /[\s(]/.test(source[i - 1]!))) {
      const match = /^https?:\/\/[^\s<>()"]+/.exec(source.slice(i));
      if (match) {
        const url = match[0].replace(/[.,;:!?'*]+$/, '');
        flush();
        out.push({ t: 'link', href: url, c: [{ t: 'text', v: url }] });
        i += url.length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

function closingMarker(source: string, marker: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const at = source.indexOf(marker, i);
    if (at === -1) return -1;
    // `**a*b**`: a single marker inside a double isn't the end; nor is one before a letter for `_`.
    const before = source[at - 1];
    const after = source[at + marker.length];
    const lone = marker.length === 2 || after !== marker[0];
    const okAfter = marker[0] !== '_' || after === undefined || !/\w/.test(after);
    if (before !== ' ' && lone && okAfter && at > from) return at;
    i = at + marker.length;
  }
  return -1;
}

/** The `)` that closes the `(` at `open` (links can hold parentheses: Wikipedia's do). */
function closingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return i;
    else if (source[i] === '\n') return -1;
  }
  return -1;
}

function closingBracket(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === '[') depth++;
    else if (source[i] === ']' && --depth === 0) return i;
  }
  return -1;
}

/** The words of some inline content (no markup, no citation markers). */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) =>
      node.t === 'text' || node.t === 'code' ? node.v : node.t === 'cite' ? '' : inlineText(node.c),
    )
    .join('');
}

/** Plain text of a document, one block per line — what search and note titles use. */
export function plainText(blocks: readonly Block[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.t === 'heading' || block.t === 'paragraph') lines.push(inlineText(block.c));
    else if (block.t === 'code') lines.push(block.v);
    else if (block.t === 'quote') lines.push(plainText(block.c));
    else if (block.t === 'list') {
      block.items.forEach((item, n) =>
        lines.push(`${block.ordered ? `${block.start + n}.` : '•'} ${plainText(item)}`),
      );
    } else if (block.t === 'table') {
      for (const row of [block.head, ...block.rows]) lines.push(row.map(inlineText).join(' · '));
    }
  }
  return lines.join('\n');
}
