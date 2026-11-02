import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formats,
  grade,
  nearestPassing,
  parseColor,
  rgbToHsl,
  rgbToOklch,
  toHex,
} from '@shared/toolkit/color';
import { DEFAULT_SHADOW, gradientCss, pxToRem, remToPx, shadowCss } from '@shared/toolkit/css';
import { describeJson, errorOffset, formatJson, lineAndColumn } from '@shared/toolkit/json';
import { formatBytes, imageFacts } from '../../src/main/toolkit/image-info';
import { fitViewport } from '@shared/toolkit/viewport';
import { presetName } from '@shared/toolkit/state';
import { wantsLocalServers } from '../../src/main/commandbar/model';
import { aspect, pageTitle } from '../../src/main/toolkit/model';
import {
  decode,
  decodeJwt,
  encode,
  readTime,
  testRegex,
  timeViews,
  typeScale,
} from '@shared/toolkit/text';

describe('colours', () => {
  it('reads the usual ways of writing a colour', () => {
    expect(parseColor('#5b5bd6')).toEqual({ r: 91, g: 91, b: 214, a: 1 });
    expect(parseColor('fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 0.502 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('hsl(0 100% 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('nope')).toBeNull();
    expect(parseColor('rgb(1,2)')).toBeNull();
  });

  it('writes HEX, RGB, HSL and OKLCH', () => {
    const red = parseColor('#ff0000')!;
    expect(toHex(red)).toBe('#ff0000');
    expect(rgbToHsl(red)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToOklch(red)).toEqual({ l: 0.628, c: 0.258, h: 29.2 });
    expect(formats(red).map((f) => f.value)).toEqual([
      '#ff0000',
      'rgb(255 0 0)',
      'hsl(0 100% 50%)',
      'oklch(62.8% 0.258 29.2)',
    ]);
  });

  it('grades contrast like WCAG 2.x', () => {
    const black = parseColor('#000')!;
    const white = parseColor('#fff')!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(grade(parseColor('#767676')!, white)).toMatchObject({
      ratio: 4.54,
      aa: true,
      aaa: false,
    });
    expect(grade(parseColor('#777777')!, white)).toMatchObject({ aa: false, aaLarge: true });
  });

  it('finds the nearest colour that passes', () => {
    const white = parseColor('#fff')!;
    const light = parseColor('#a0a0ff')!;
    const fixed = nearestPassing(light, white)!;
    expect(contrastRatio(fixed, white)).toBeGreaterThanOrEqual(4.5);
    expect(rgbToHsl(fixed).h).toBeCloseTo(rgbToHsl(light).h, 0);
    expect(nearestPassing(parseColor('#000')!, white)).toEqual(parseColor('#000'));
  });
});

describe('CSS helpers', () => {
  it('converts units and builds shadows and gradients', () => {
    expect(pxToRem(24)).toBe('1.5rem');
    expect(remToPx(0.875)).toBe('14px');
    expect(pxToRem(10, 20)).toBe('0.5rem');
    expect(shadowCss(DEFAULT_SHADOW)).toBe('0px 8px 24px -6px rgb(0 0 0 / 0.25)');
    expect(shadowCss({ ...DEFAULT_SHADOW, inset: true, color: '#ff0000', opacity: 50 })).toBe(
      'inset 0px 8px 24px -6px rgb(255 0 0 / 0.5)',
    );
    expect(
      gradientCss({
        kind: 'linear',
        angle: 90,
        stops: [
          { color: '#fff', at: 100 },
          { color: '#000', at: 0 },
        ],
      }),
    ).toBe('linear-gradient(90deg, #000 0%, #fff 100%)');
  });
});

describe('JSON', () => {
  it('formats, minifies and sorts', () => {
    expect(formatJson('{"b":1,"a":[1,2]}', 'pretty')).toMatchObject({
      ok: true,
      text: '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}',
    });
    expect(formatJson('{ "b": 1 }', 'minify')).toMatchObject({ ok: true, text: '{"b":1}' });
    expect(formatJson('{"b":1,"a":{"d":1,"c":2}}', 'sort')).toMatchObject({
      text: '{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}',
    });
    expect(describeJson([1, 2])).toBe('Array · 2 items');
    expect(describeJson({ a: 1 })).toBe('Object · 1 key');
  });

  it('says where it is broken', () => {
    const result = formatJson('{\n  "a": 1,\n  "b": }', 'pretty');
    expect(result.ok).toBe(false);
    if (!result.ok) expect([result.line, result.column]).toEqual([3, 8]);
    expect(lineAndColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
    expect(errorOffset('[1, 2,]')).toBe(6);
    expect(errorOffset('{"a": "x\\q"}')).toBe(9);
    expect(errorOffset('{"a": [true, null, -1.5e3]}')).toBeNull();
    expect(errorOffset('{} x')).toBe(3);
    expect(formatJson('  ', 'pretty')).toMatchObject({ ok: false, error: 'Paste some JSON' });
  });
});

/** Bytes from a list of numbers and strings. */
const bytes = (...parts: (number | string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === 'number' ? [p] : typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

describe('image facts', () => {
  it('reads a PNG header', () => {
    const png = bytes(
      0x89,
      'PNG',
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      be32(13),
      'IHDR',
      be32(640),
      be32(480),
      8,
      6,
      0,
      0,
      0,
    );
    expect(imageFacts(png)).toEqual({
      format: 'PNG',
      width: 640,
      height: 480,
      details: [{ label: 'Color', value: 'RGBA, 8-bit' }],
    });
  });

  it('reads a JPEG’s size and camera details', () => {
    // TIFF (big-endian): IFD0 = Make, Model, ExifIFD pointer; Exif IFD = FNumber, ISO.
    const make = 'Canon\0';
    const model = 'Canon EOS R5\0';
    const ifd0At = 8;
    const ifd0Size = 2 + 3 * 12 + 4;
    const subAt = ifd0At + ifd0Size;
    const subSize = 2 + 2 * 12 + 4;
    const dataAt = subAt + subSize;
    const makeAt = dataAt;
    const modelAt = makeAt + make.length;
    const fAt = modelAt + model.length;
    const entry = (tag: number, type: number, count: number, value: number[]) => [
      ...be16(tag),
      ...be16(type),
      ...be32(count),
      ...value,
    ];
    const tiff = bytes(
      'MM',
      be16(42),
      be32(ifd0At),
      be16(3),
      entry(0x010f, 2, make.length, be32(makeAt)),
      entry(0x0110, 2, model.length, be32(modelAt)),
      entry(0x8769, 4, 1, be32(subAt)),
      be32(0),
      be16(2),
      entry(0x829d, 5, 1, be32(fAt)),
      entry(0x8827, 3, 1, [...be16(400), 0, 0]),
      be32(0),
      make,
      model,
      be32(28),
      be32(10),
    );
    const app1 = bytes('Exif', 0, 0, [...tiff]);
    const jpeg = bytes(
      0xff,
      0xd8,
      0xff,
      0xe1,
      be16(app1.length + 2),
      [...app1],
      0xff,
      0xc0,
      be16(17),
      8,
      be16(1080),
      be16(1920),
      3,
      Array.from({ length: 9 }, () => 0),
      0xff,
      0xd9,
    );
    const facts = imageFacts(jpeg);
    expect(facts).toMatchObject({ format: 'JPEG', width: 1920, height: 1080 });
    expect(facts.details).toEqual([
      { label: 'Camera', value: 'Canon EOS R5' },
      { label: 'Exposure', value: 'ƒ/2.8 · ISO 400' },
    ]);
  });

  it('knows GIF, WebP and SVG, and sizes in words', () => {
    expect(imageFacts(bytes('GIF89a', 0x40, 0x01, 0xf0, 0x00))).toMatchObject({
      format: 'GIF',
      width: 320,
      height: 240,
    });
    expect(imageFacts(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')).format).toBe('SVG');
    expect(imageFacts(bytes('hello')).format).toBe('Unknown');
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('responsive mode and local servers', () => {
  it('fits a device under the bar, centred, scaled down only', () => {
    const area = { x: 100, y: 50, width: 800, height: 700 };
    const phone = fitViewport(area, { width: 393, height: 852 });
    expect(phone.scale).toBeCloseTo((700 - 44 - 16) / 852, 2);
    expect(phone.bounds.y).toBe(50 + 44);
    expect(Math.abs(phone.bounds.x + phone.bounds.width / 2 - (100 + 400))).toBeLessThanOrEqual(1);
    const small = fitViewport(area, { width: 320, height: 400 });
    expect(small.scale).toBe(1);
    expect(small.bounds).toMatchObject({ width: 320, height: 400 });
  });

  it('names presets in either orientation', () => {
    expect(presetName({ width: 393, height: 852 })).toBe('iPhone 15');
    expect(presetName({ width: 852, height: 393 })).toBe('iPhone 15');
    expect(presetName({ width: 500, height: 500 })).toBeNull();
  });

  it('asks for local servers only when the query does', () => {
    expect(wantsLocalServers('localhost')).toBe(true);
    expect(wantsLocalServers(':5173')).toBe(true);
    expect(wantsLocalServers('local')).toBe(true);
    expect(wantsLocalServers('weather')).toBe(false);
    expect(pageTitle('<html><title> Vite &amp; React </title>')).toBe('Vite & React');
    expect(pageTitle('<p>no title</p>')).toBe('');
    expect(aspect(1920, 1080)).toBe('16:9');
    expect(aspect(1000, 997)).toBeNull();
  });
});

describe('text tools', () => {
  it('encodes and decodes Base64 (UTF-8), URLs and HTML entities', () => {
    expect(encode('héllo ✓', 'base64')).toBe('aMOpbGxvIOKckw==');
    expect(decode('aMOpbGxvIOKckw==', 'base64')).toEqual({ ok: true, text: 'héllo ✓' });
    expect(decode('aMOpbGxvIOKckw', 'base64')).toEqual({ ok: true, text: 'héllo ✓' }); // no padding
    expect(decode('%%%', 'base64').ok).toBe(false);
    expect(encode('a b&c', 'url')).toBe('a%20b%26c');
    expect(decode('a+b%26c', 'url')).toEqual({ ok: true, text: 'a b&c' });
    expect(encode('<a href="x">', 'html')).toBe('&lt;a href=&quot;x&quot;&gt;');
    expect(decode('&lt;b&gt; &#169; &#x2713; &unknown;', 'html')).toEqual({
      ok: true,
      text: '<b> © ✓ &unknown;',
    });
  });

  it('reads JWTs without verifying them', () => {
    const jwt = `${encode('{"alg":"HS256"}', 'base64')}.${encode('{"sub":"42"}', 'base64')}.sig`;
    expect(decodeJwt(jwt)).toEqual({ header: { alg: 'HS256' }, payload: { sub: '42' } });
    expect(decodeJwt('not.a.jwt')).toBeNull();
  });

  it('reads timestamps as people paste them', () => {
    expect(readTime('1700000000')).toBe(1_700_000_000_000);
    expect(readTime('1700000000123')).toBe(1_700_000_000_123);
    expect(readTime('2026-11-02T10:00:00Z')).toBe(Date.UTC(2026, 10, 2, 10));
    expect(readTime('soon')).toBeNull();
    expect(timeViews(0)[2]).toEqual({ label: 'ISO 8601 (UTC)', value: '1970-01-01T00:00:00.000Z' });
  });

  it('tests regular expressions safely', () => {
    expect(testRegex('(\\d+)-(\\d+)', '', 'a 1-2 b 30-40')).toEqual({
      ok: true,
      matches: [
        { index: 2, text: '1-2', groups: ['1', '2'] },
        { index: 8, text: '30-40', groups: ['30', '40'] },
      ],
    });
    expect(testRegex('(', '', 'x').ok).toBe(false);
    const empty = testRegex('x*', 'g', 'aaa');
    expect(empty.ok && empty.matches.length).toBe(4);
  });

  it('builds a type scale', () => {
    const scale = typeScale(16, 1.25, 1, 2);
    expect(scale.map((s) => s.px)).toEqual([25, 20, 16, 12.8]);
    expect(scale[0]).toEqual({ step: 2, px: 25, rem: '1.563rem' });
  });
});
