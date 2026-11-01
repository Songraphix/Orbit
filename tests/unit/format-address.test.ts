import { describe, expect, it } from 'vitest';
import { formatAddress } from '@shared/format-address';

describe('formatAddress', () => {
  it('shows bare domain and title, dropping www.', () => {
    expect(formatAddress('https://www.youtube.com/watch?v=1', 'Heavenly Worship')).toEqual({
      domain: 'youtube.com',
      title: 'Heavenly Worship',
      secure: true,
    });
  });

  it('keeps the port for local development servers', () => {
    expect(formatAddress('http://localhost:3000/app', 'My App')).toEqual({
      domain: 'localhost:3000',
      title: 'My App',
      secure: false,
    });
  });

  it('falls back to the path when the title is just the URL', () => {
    const url = 'https://example.com/docs/intro';
    expect(formatAddress(url, url).title).toBe('/docs/intro');
    expect(formatAddress('https://example.com/', 'https://example.com/').title).toBe('');
  });

  it('labels internal pages by title only', () => {
    expect(formatAddress('orbit://newtab', 'New Tab')).toEqual({
      domain: '',
      title: 'New Tab',
      secure: true,
    });
  });

  it('survives garbage', () => {
    expect(formatAddress('not a url', 'x')).toEqual({
      domain: 'not a url',
      title: 'x',
      secure: false,
    });
  });
});
