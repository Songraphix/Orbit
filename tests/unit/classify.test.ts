import { describe, expect, it } from 'vitest';
import { classifyInput } from '../../src/main/omnibox/classify';

const url = (u: string) => ({ kind: 'url', url: u });
const search = (q: string) => ({
  kind: 'search',
  url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
});

describe('classifyInput', () => {
  it.each([
    ['github.com', 'https://github.com/'],
    ['github.com/foo/bar', 'https://github.com/foo/bar'],
    ['mail.google.com', 'https://mail.google.com/'],
    ['bbc.co.uk', 'https://bbc.co.uk/'],
    ['https://example.com/a?b=c', 'https://example.com/a?b=c'],
    ['http://example.com', 'http://example.com/'],
    ['localhost:3000', 'http://localhost:3000/'],
    ['localhost', 'http://localhost/'],
    ['192.168.1.1', 'http://192.168.1.1/'],
    ['127.0.0.1:8080/api', 'http://127.0.0.1:8080/api'],
    ['orbit://newtab', 'orbit://newtab'],
    ['  youtube.com  ', 'https://youtube.com/'],
  ])('%s → address', (input, expected) => {
    expect(classifyInput(input)).toEqual(url(expected));
  });

  it.each([
    'what is arc',
    'arc',
    'notes.txt',
    'notadomain.invalidtld',
    '999.1.1.1',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,hi',
  ])('%s → search', (input) => {
    expect(classifyInput(input)).toEqual(search(input));
  });

  it('returns null for empty input', () => {
    expect(classifyInput('   ')).toBeNull();
  });

  it('uses a custom search engine template', () => {
    expect(classifyInput('cats', 'https://duckduckgo.com/?q=%s')).toEqual({
      kind: 'search',
      url: 'https://duckduckgo.com/?q=cats',
    });
  });
});
