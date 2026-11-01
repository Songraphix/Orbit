import { afterEach, describe, expect, it } from 'vitest';
import { boostPatchSchema, boostSettingsSchema, EMPTY_BOOST_SETTINGS } from '@shared/types/boosts';
import type { Boost } from '@shared/types/boosts';
import {
  boostsFor,
  colorCss,
  composeCss,
  defaultBoostName,
  domainForPage,
  fontCss,
  matchesDomain,
  normalizeDomain,
  withZapped,
  zapCss,
} from '../../src/main/boosts/model';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { BoostRepository } from '../../src/main/persistence/repositories/boosts';

const boost = (patch: Partial<Boost>): Boost => ({
  id: 'b1',
  name: 'Boost',
  domain: 'youtube.com',
  enabled: true,
  css: '',
  js: '',
  settings: EMPTY_BOOST_SETTINGS,
  updatedAt: 1,
  ...patch,
});

describe('Boost matching', () => {
  it('normalises what the user types into a bare host', () => {
    expect(normalizeDomain('https://www.YouTube.com/watch?v=1')).toBe('youtube.com');
    expect(normalizeDomain(' news.ycombinator.com ')).toBe('news.ycombinator.com');
    expect(normalizeDomain('localhost:3000')).toBe('localhost');
    expect(normalizeDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('youtube')).toBeNull();
    expect(normalizeDomain('not a site')).toBeNull();
  });

  it('matches the domain and its subdomains, on web pages only', () => {
    expect(matchesDomain('youtube.com', 'https://youtube.com/')).toBe(true);
    expect(matchesDomain('youtube.com', 'https://m.youtube.com/watch')).toBe(true);
    expect(matchesDomain('youtube.com', 'https://notyoutube.com/')).toBe(false);
    expect(matchesDomain('youtube.com', 'https://youtube.com.evil.io/')).toBe(false);
    expect(matchesDomain('localhost', 'http://localhost:5173/')).toBe(true);
    expect(matchesDomain('', 'https://youtube.com/')).toBe(false);
    expect(matchesDomain('youtube.com', 'orbit://boost/youtube.com')).toBe(false);
    expect(matchesDomain('youtube.com', 'not a url')).toBe(false);
  });

  it('picks enabled Boosts for a page, oldest first', () => {
    const boosts = [
      boost({ id: 'new', updatedAt: 5 }),
      boost({ id: 'old', updatedAt: 2 }),
      boost({ id: 'off', enabled: false }),
      boost({ id: 'other', domain: 'github.com' }),
    ];
    expect(boostsFor(boosts, 'https://www.youtube.com/').map((b) => b.id)).toEqual(['old', 'new']);
  });

  it('suggests the page’s site for a new Boost', () => {
    expect(domainForPage('https://www.github.com/a/b')).toBe('github.com');
    expect(domainForPage('orbit://newtab')).toBe('');
    expect(defaultBoostName('github.com')).toBe('Boost for github.com');
    expect(defaultBoostName('')).toBe('Boost');
  });
});

describe('Boost CSS', () => {
  it('turns the colour tool into a page filter', () => {
    expect(colorCss({ hue: 0, saturation: 100, brightness: 100, dark: false })).toBe('');
    expect(colorCss({ hue: 90, saturation: 150, brightness: 100, dark: false })).toBe(
      'html { filter: hue-rotate(90deg) saturate(150%) !important; }',
    );
    const dark = colorCss({ hue: 0, saturation: 100, brightness: 100, dark: true });
    expect(dark).toContain('html { filter: invert(1) hue-rotate(180deg) !important; }');
    // Photos and video are flipped back, and transparent pages get a background to invert.
    expect(dark).toContain('img, picture, video');
    expect(dark).toContain(':where(html) { background-color: #fff; }');
  });

  it('sets the font everywhere except code and icon fonts', () => {
    const css = fontCss('Avenir Next');
    expect(css).toContain('font-family: "Avenir Next", system-ui, sans-serif !important');
    expect(css).toContain(':not(code, pre');
  });

  it('hides zapped elements with one rule each, then adds the user’s CSS last', () => {
    expect(zapCss(['#ad', '.promo > div'])).toBe(
      '#ad { display: none !important; }\n.promo > div { display: none !important; }',
    );
    const css = composeCss({
      css: '  body { margin: 0 }  ',
      settings: {
        color: { hue: 30, saturation: 100, brightness: 100, dark: false },
        font: 'Georgia',
        zapped: ['#ad'],
      },
    });
    const lines = css.split('\n');
    expect(lines[0]).toContain('hue-rotate(30deg)');
    expect(lines[1]).toContain('"Georgia"');
    expect(lines[2]).toBe('#ad { display: none !important; }');
    expect(lines[3]).toBe('body { margin: 0 }');
    expect(composeCss({ css: '', settings: EMPTY_BOOST_SETTINGS })).toBe('');
  });

  it('adds a zapped selector once', () => {
    const once = withZapped(EMPTY_BOOST_SETTINGS, '#ad');
    expect(withZapped(once, '#ad')).toBe(once);
    expect(once.zapped).toEqual(['#ad']);
  });

  it('rejects settings that could break out of a CSS rule', () => {
    const ok = { color: null, font: null, zapped: ['div.a > p:nth-of-type(2)', '#\\31 23'] };
    expect(boostSettingsSchema.safeParse(ok).success).toBe(true);
    for (const zapped of [['a{}'], ['a; b'], ['@import x'], ['a\nb'], ['</style>']]) {
      expect(boostSettingsSchema.safeParse({ ...ok, zapped }).success).toBe(false);
    }
    for (const font of ['Arial"; } body {', 'a;b', '']) {
      expect(boostSettingsSchema.safeParse({ ...ok, font }).success).toBe(false);
    }
    expect(boostPatchSchema.safeParse({ name: '' }).success).toBe(false);
    expect(boostPatchSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});

describe('BoostRepository', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new BoostRepository(db);
  };

  it('creates, updates, lists and deletes Boosts', () => {
    const r = repo();
    const a = r.create({ name: 'Boost for youtube.com', domain: 'youtube.com' }, 1);
    const b = r.create({ name: 'GitHub', domain: 'github.com' }, 2);
    expect(a).toMatchObject({ enabled: true, css: '', js: '', settings: EMPTY_BOOST_SETTINGS });
    expect(r.list().map((x) => x.id)).toEqual([a.id, b.id]);

    const settings = { color: null, font: 'Georgia', zapped: ['#ad'] };
    const updated = r.update(a.id, { css: 'body{}', enabled: false, settings }, 9);
    expect(updated).toMatchObject({ css: 'body{}', enabled: false, settings, updatedAt: 9 });
    expect(r.update('missing', { css: 'x' })).toBeNull();

    r.delete(b.id);
    expect(r.list().map((x) => x.id)).toEqual([a.id]);
    expect(r.get(b.id)).toBeNull();
  });

  it('keeps a Boost whose tool settings are damaged', () => {
    const r = repo();
    const a = r.create({ name: 'A', domain: 'a.com' });
    db!.prepare("UPDATE boosts SET settings_json = '{bad' WHERE id = ?").run(a.id);
    expect(r.get(a.id)?.settings).toEqual(EMPTY_BOOST_SETTINGS);
  });
});
