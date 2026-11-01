import { describe, expect, it } from 'vitest';
import { decideWindowOpen, parseFeatures } from '../../src/main/tabs/window-open';

const req = (url: string, disposition: string, features = '') => ({ url, disposition, features });

describe('decideWindowOpen', () => {
  it('opens target=_blank links as an active tab', () => {
    expect(decideWindowOpen(req('https://a.com/', 'foreground-tab'))).toEqual({
      kind: 'tab',
      url: 'https://a.com/',
      activate: true,
    });
  });

  it('opens ⌘-click links as a background tab', () => {
    expect(decideWindowOpen(req('https://a.com/', 'background-tab'))).toMatchObject({
      kind: 'tab',
      activate: false,
    });
  });

  it('opens window.open with features as a real popup, sized from the features', () => {
    expect(
      decideWindowOpen(
        req('https://accounts.google.com/o/oauth2', 'new-window', 'width=480,height=600'),
      ),
    ).toEqual({ kind: 'popup', width: 480, height: 600 });
  });

  it('allows about:blank only as a popup (sign-in flows start there)', () => {
    expect(decideWindowOpen(req('about:blank', 'new-window')).kind).toBe('popup');
    expect(decideWindowOpen(req('about:blank', 'foreground-tab')).kind).toBe('deny');
  });

  it('clamps silly popup sizes and defaults missing ones', () => {
    expect(decideWindowOpen(req('https://a.com/', 'new-window', 'width=5,height=99999'))).toEqual({
      kind: 'popup',
      width: 200,
      height: 2000,
    });
    expect(decideWindowOpen(req('https://a.com/', 'new-window'))).toEqual({
      kind: 'popup',
      width: 500,
      height: 640,
    });
  });

  it('refuses non-web schemes', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'orbit://newtab',
      'data:text/html,x',
    ]) {
      expect(decideWindowOpen(req(url, 'new-window')).kind).toBe('deny');
      expect(decideWindowOpen(req(url, 'foreground-tab')).kind).toBe('deny');
    }
  });
});

describe('parseFeatures', () => {
  it('parses comma and space separated pairs', () => {
    expect(parseFeatures('width=480, height=600,popup')).toEqual({
      width: '480',
      height: '600',
      popup: '',
    });
  });
});
