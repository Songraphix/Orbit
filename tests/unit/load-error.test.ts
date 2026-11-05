import { describe, expect, it } from 'vitest';
import { loadErrorText } from '../../src/shared/load-error';

describe('loadErrorText', () => {
  it('says what happened in plain words, naming the site', () => {
    expect(loadErrorText(-106, 'docs.google.com').title).toBe('You’re offline');
    expect(loadErrorText(-105, 'exampel.com').detail).toContain('exampel.com');
    expect(loadErrorText(-102, 'localhost').title).toBe('Can’t connect');
    expect(loadErrorText(-118, 'slow.example').title).toMatch(/too long/);
    expect(loadErrorText(-27, 'x.com').detail).toMatch(/as a tab/);
    expect(loadErrorText(-312, '127.0.0.1').title).toMatch(/won’t open/);
  });

  it('treats every certificate error alike, and falls back with the code', () => {
    expect(loadErrorText(-201, 'a.com').title).toMatch(/isn’t private/);
    expect(loadErrorText(-299, 'a.com').title).toMatch(/isn’t private/);
    expect(loadErrorText(-400, 'a.com')).toEqual({
      title: 'This page couldn’t load',
      detail: 'a.com didn’t load (error -400).',
    });
    expect(loadErrorText(-400, '').detail).toBe('This site didn’t load (error -400).');
  });
});
