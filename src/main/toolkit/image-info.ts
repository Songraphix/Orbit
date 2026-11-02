/**
 * Image facts for the Creative Toolkit (roadmap P3.5): format and size from the file's own
 * header, and a JPEG's camera details (EXIF) — read from the bytes, nothing decoded. Pure.
 */

export type ImageFacts = {
  format: string;
  width: number | null;
  height: number | null;
  /** Camera, lens, exposure… (JPEG/EXIF), colour depth (PNG), animation. */
  details: { label: string; value: string }[];
};

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

export function imageFacts(bytes: Uint8Array): ImageFacts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && ascii(bytes, 1, 4) === 'PNG') return png(bytes, view);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes, view);
  if (bytes.length >= 10 && ascii(bytes, 0, 3) === 'GIF') {
    return {
      format: 'GIF',
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
      details: [],
    };
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return webp(bytes, view);
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand.startsWith('avi')) return { format: 'AVIF', width: null, height: null, details: [] };
    if (brand.startsWith('hei') || brand === 'mif1') {
      return { format: 'HEIC', width: null, height: null, details: [] };
    }
  }
  const head = ascii(bytes, 0, Math.min(bytes.length, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return { format: 'SVG', width: null, height: null, details: [] };
  }
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === 'BM') {
    return {
      format: 'BMP',
      width: bytes.length >= 26 ? view.getInt32(18, true) : null,
      height: bytes.length >= 26 ? Math.abs(view.getInt32(22, true)) : null,
      details: [],
    };
  }
  return { format: 'Unknown', width: null, height: null, details: [] };
}

const PNG_COLOUR: Record<number, string> = {
  0: 'Greyscale',
  2: 'RGB',
  3: 'Indexed',
  4: 'Greyscale + alpha',
  6: 'RGBA',
};

function png(bytes: Uint8Array, view: DataView): ImageFacts {
  const details: ImageFacts['details'] = [];
  const depth = bytes[24];
  const colour = bytes[25];
  if (depth !== undefined && colour !== undefined) {
    details.push({ label: 'Colour', value: `${PNG_COLOUR[colour] ?? 'Other'}, ${depth}-bit` });
  }
  // Chunks: animated (acTL) or not.
  let at = 8;
  while (at + 8 <= bytes.length && at < 1_000_000) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, at + 8);
    if (type === 'acTL') {
      details.push({ label: 'Animation', value: `${view.getUint32(at + 8)} frames` });
      break;
    }
    if (type === 'IDAT' || type === 'IEND') break;
    at += 12 + length;
  }
  return { format: 'PNG', width: view.getUint32(16), height: view.getUint32(20), details };
}

function webp(bytes: Uint8Array, view: DataView): ImageFacts {
  const chunk = ascii(bytes, 12, 16);
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      format: 'WebP',
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
      details: [],
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const b = view.getUint32(21, true);
    return {
      format: 'WebP',
      width: (b & 0x3fff) + 1,
      height: ((b >> 14) & 0x3fff) + 1,
      details: [{ label: 'Compression', value: 'Lossless' }],
    };
  }
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const flags = bytes[20] ?? 0;
    const w = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const h = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return {
      format: 'WebP',
      width: w,
      height: h,
      details: flags & 0x02 ? [{ label: 'Animation', value: 'Animated' }] : [],
    };
  }
  return { format: 'WebP', width: null, height: null, details: [] };
}

function jpeg(bytes: Uint8Array, view: DataView): ImageFacts {
  let width: number | null = null;
  let height: number | null = null;
  let details: ImageFacts['details'] = [];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1]!;
    if (marker === 0xd9 || marker === 0xda) break; // end, or the image data starts
    const length = view.getUint16(at + 2);
    // Start of frame (baseline, progressive…): the size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (at + 9 <= bytes.length) {
        height = view.getUint16(at + 5);
        width = view.getUint16(at + 7);
      }
    }
    if (marker === 0xe1 && ascii(bytes, at + 4, at + 8) === 'Exif') {
      details = exif(bytes, at + 10, Math.min(bytes.length, at + 2 + length));
    }
    at += 2 + length;
  }
  return { format: 'JPEG', width, height, details };
}

/** The EXIF fields people look for, from the TIFF block starting at `start`. */
function exif(bytes: Uint8Array, start: number, end: number): ImageFacts['details'] {
  if (start + 8 > end) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start);
  const little = ascii(bytes, start, start + 2) === 'II';
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const inside = (o: number, n = 1) => o >= 0 && o + n <= view.byteLength;
  type Entry = { tag: number; type: number; count: number; valueAt: number };
  const readIfd = (offset: number): Entry[] => {
    if (!inside(offset, 2)) return [];
    const count = Math.min(u16(offset), 200);
    const entries: Entry[] = [];
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (!inside(e, 12)) break;
      const type = u16(e + 2);
      const n = u32(e + 4);
      const size =
        ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
      entries.push({ tag: u16(e), type, count: n, valueAt: size * n <= 4 ? e + 8 : u32(e + 8) });
    }
    return entries;
  };
  const text = (e: Entry) =>
    inside(e.valueAt, e.count)
      ? ascii(new Uint8Array(view.buffer, view.byteOffset + e.valueAt, e.count), 0, e.count)
          .replace(/\0+$/, '')
          .trim()
      : '';
  const rational = (e: Entry) => {
    if (!inside(e.valueAt, 8)) return null;
    const d = u32(e.valueAt + 4);
    return d === 0 ? null : u32(e.valueAt) / d;
  };
  const short = (e: Entry) =>
    e.type === 3 ? u16(e.valueAt) : inside(e.valueAt, 4) ? u32(e.valueAt) : null;
  const ifd0 = readIfd(u32(4));
  const find = (list: Entry[], tag: number) => list.find((e) => e.tag === tag);
  const exifPointer = find(ifd0, 0x8769);
  const sub = exifPointer ? readIfd(u32(exifPointer.valueAt)) : [];
  const out: ImageFacts['details'] = [];
  const make = find(ifd0, 0x010f);
  const model = find(ifd0, 0x0110);
  const camera = [make && text(make), model && text(model)].filter(Boolean).join(' ');
  if (camera) out.push({ label: 'Camera', value: dedupeWords(camera) });
  const lens = find(sub, 0xa434);
  if (lens && text(lens)) out.push({ label: 'Lens', value: text(lens) });
  const exposure = find(sub, 0x829a);
  const fNumber = find(sub, 0x829d);
  const iso = find(sub, 0x8827);
  const focal = find(sub, 0x920a);
  const settings = [
    focal && rational(focal) ? `${Math.round(rational(focal)!)} mm` : '',
    fNumber && rational(fNumber) ? `ƒ/${Math.round(rational(fNumber)! * 10) / 10}` : '',
    exposure && rational(exposure) ? shutter(rational(exposure)!) : '',
    iso && short(iso) ? `ISO ${short(iso)}` : '',
  ].filter(Boolean);
  if (settings.length) out.push({ label: 'Exposure', value: settings.join(' · ') });
  const taken = find(sub, 0x9003) ?? find(ifd0, 0x0132);
  if (taken && text(taken)) {
    out.push({
      label: 'Taken',
      value: text(taken).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'),
    });
  }
  const software = find(ifd0, 0x0131);
  if (software && text(software)) out.push({ label: 'Software', value: text(software) });
  if (find(ifd0, 0x8825)) out.push({ label: 'Location', value: 'Includes GPS position' });
  return out;
}

function shutter(seconds: number): string {
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

/** "Canon Canon EOS R5" → "Canon EOS R5". */
function dedupeWords(text: string): string {
  const words = text.split(/\s+/);
  return words
    .filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1]!.toLowerCase())
    .join(' ');
}

/** "1.2 MB", "820 KB", "512 bytes". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
}
