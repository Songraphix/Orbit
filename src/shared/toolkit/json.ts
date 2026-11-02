/**
 * JSON for the Developer Toolkit (roadmap P3.6): check it, pretty-print, minify or sort keys,
 * and say where it's broken (line and column), not just that it is. Pure.
 */

export type JsonResult =
  | { ok: true; value: unknown; text: string }
  | { ok: false; error: string; line: number | null; column: number | null };

/** Where an error position falls: 1-based line and column. */
export function lineAndColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, position));
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

function failure(text: string, error: unknown): JsonResult {
  const message = (error instanceof Error ? error.message : String(error)).replace(
    /, "[\s\S]*" is not valid JSON$/,
    '',
  );
  const at = errorOffset(text);
  const where = at === null ? null : lineAndColumn(text, at);
  return { ok: false, error: message, line: where?.line ?? null, column: where?.column ?? null };
}

/**
 * Where JSON stops being JSON: a strict scan (V8's messages don't always say). Null when the
 * scan finds nothing wrong.
 */
export function errorOffset(text: string): number | null {
  let i = 0;
  class Stop extends Error {
    constructor(readonly at: number) {
      super('stop');
    }
  }
  const fail = (): never => {
    throw new Stop(i);
  };
  const space = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const literal = (word: string) => {
    for (const ch of word) {
      if (text[i] !== ch) fail();
      i++;
    }
  };
  const string = () => {
    i++; // opening quote
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '"') {
        i++;
        return;
      }
      if (ch < ' ') fail();
      if (ch === '\\') {
        i++;
        const esc = text[i];
        if (esc === 'u') {
          for (let k = 1; k <= 4; k++) if (!/[0-9a-fA-F]/.test(text[i + k] ?? '')) fail();
          i += 5;
          continue;
        }
        if (!esc || !'"\\/bfnrt'.includes(esc)) fail();
      }
      i++;
    }
    fail();
  };
  const number = () => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match) fail();
    i += match![0].length;
  };
  const value = (): void => {
    space();
    const ch = text[i];
    if (ch === '{') {
      i++;
      space();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        space();
        if (text[i] !== '"') fail();
        string();
        space();
        if (text[i] !== ':') fail();
        i++;
        value();
        space();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        fail();
      }
    }
    if (ch === '[') {
      i++;
      space();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        space();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return;
        }
        fail();
      }
    }
    if (ch === '"') return string();
    if (ch === 't') return literal('true');
    if (ch === 'f') return literal('false');
    if (ch === 'n') return literal('null');
    if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) return number();
    fail();
  };
  try {
    value();
    space();
    if (i < text.length) fail();
    return null;
  } catch (error) {
    if (error instanceof Stop) return error.at;
    throw error;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function formatJson(
  text: string,
  mode: 'pretty' | 'minify' | 'sort',
  indent: 2 | 4 = 2,
): JsonResult {
  if (!text.trim()) return { ok: false, error: 'Paste some JSON', line: null, column: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return failure(text, error);
  }
  if (mode === 'minify') return { ok: true, value, text: JSON.stringify(value) };
  const out = mode === 'sort' ? sortKeys(value) : value;
  return { ok: true, value: out, text: JSON.stringify(out, null, indent) };
}

/** A short description: "Object · 12 keys", "Array · 3 items", "String". */
export function describeJson(value: unknown): string {
  if (Array.isArray(value)) return `Array · ${value.length} item${value.length === 1 ? '' : 's'}`;
  if (value === null) return 'null';
  if (typeof value === 'object') {
    const n = Object.keys(value).length;
    return `Object · ${n} key${n === 1 ? '' : 's'}`;
  }
  return typeof value === 'string' ? 'String' : typeof value === 'number' ? 'Number' : 'Boolean';
}
