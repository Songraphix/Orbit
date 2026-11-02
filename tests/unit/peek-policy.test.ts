import { describe, expect, it } from 'vitest';
import { shouldPeek, siteOf } from '../../src/main/peek/policy';
import type { PeekRequest } from '../../src/main/peek/policy';

const base: PeekRequest = {
  section: 'pinned',
  fromUrl: 'https://mail.google.com/mail/u/0/',
  toUrl: 'https://github.com/notifications',
  activate: true,
  enabled: true,
  scope: 'pinned',
  siteSetting: null,
};

describe('siteOf', () => {
  it('uses the registrable domain, or the host for IPs and localhost', () => {
    expect(siteOf('https://mail.google.com/x')).toBe('google.com');
    expect(siteOf('https://news.bbc.co.uk/')).toBe('bbc.co.uk');
    expect(siteOf('http://127.0.0.1:8080/')).toBe('127.0.0.1');
    expect(siteOf('http://localhost:3000/')).toBe('localhost');
    expect(siteOf('mailto:a@b.c')).toBeNull();
    expect(siteOf('not a url')).toBeNull();
    expect(siteOf(null)).toBeNull();
  });
});

describe('shouldPeek', () => {
  it('peeks links from pinned tabs and favorites to other sites', () => {
    expect(shouldPeek(base)).toBe(true);
    expect(shouldPeek({ ...base, section: 'favorite' })).toBe(true);
  });

  it('peeks same-site links from pinned tabs and favorites too, like Arc (Canva → a design)', () => {
    const canva = {
      ...base,
      fromUrl: 'https://www.canva.com/',
      toUrl: 'https://www.canva.com/design/x',
    };
    expect(shouldPeek(canva)).toBe(true);
    expect(shouldPeek({ ...canva, section: 'favorite' })).toBe(true);
    expect(shouldPeek({ ...base, toUrl: 'https://accounts.google.com/' })).toBe(true);
  });

  it('leaves Today tabs and background links alone', () => {
    expect(shouldPeek({ ...base, section: 'today' })).toBe(false);
    expect(shouldPeek({ ...base, section: null })).toBe(false);
    expect(shouldPeek({ ...base, activate: false })).toBe(false);
  });

  it('can be turned off globally or for the source site', () => {
    expect(shouldPeek({ ...base, enabled: false })).toBe(false);
    expect(shouldPeek({ ...base, siteSetting: 'off' })).toBe(false);
    expect(shouldPeek({ ...base, devMode: true })).toBe(false);
    expect(shouldPeek({ ...base, siteSetting: 'on' })).toBe(true);
  });

  it('with scope "all", peeks any tab\'s links to other sites (an ad on YouTube)', () => {
    const all = { ...base, scope: 'all' as const, fromUrl: 'https://www.youtube.com/watch?v=1' };
    expect(shouldPeek({ ...all, section: 'today', toUrl: 'https://ad.example.com/' })).toBe(true);
    expect(shouldPeek({ ...all, section: 'today', toUrl: 'https://youtu.be/x' })).toBe(true);
    expect(shouldPeek({ ...all, section: 'today', toUrl: 'https://m.youtube.com/' })).toBe(false);
    expect(shouldPeek({ ...all, section: 'today', activate: false })).toBe(false);
    expect(shouldPeek({ ...all, section: null })).toBe(false);
  });

  it('never peeks non-web targets', () => {
    expect(shouldPeek({ ...base, toUrl: 'file:///etc/passwd' })).toBe(false);
  });
});
