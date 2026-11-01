import { describe, expect, it } from 'vitest';
import { dayLabel, groupByDay } from '@shared/time';
import {
  captureFileName,
  fileKindLabel,
  isSafeFileName,
  mediaKind,
  reorderTarget,
} from '../../src/main/library/model';

describe('Library model', () => {
  it('sorts files into images, videos or neither', () => {
    expect(mediaKind('photo.JPG')).toBe('image');
    expect(mediaKind('clip.mov')).toBe('video');
    expect(mediaKind('blob', 'image/webp')).toBe('image');
    expect(mediaKind('stream', 'video/mp4')).toBe('video');
    expect(mediaKind('report.pdf', 'application/pdf')).toBeNull();
  });

  it('names screenshots like macOS', () => {
    expect(captureFileName(new Date(2026, 10, 1, 9, 5, 3))).toBe(
      'Screenshot 2026-11-01 at 09.05.03.png',
    );
  });

  it('only accepts plain file names from the page', () => {
    expect(isSafeFileName('Screenshot 2026-11-01 at 09.05.03.png')).toBe(true);
    for (const bad of ['', '../x.png', 'a/b.png', 'a\\b.png', '.hidden', '..', 'x'.repeat(201)]) {
      expect(isSafeFileName(bad)).toBe(false);
    }
  });

  it('moves a space up or down one place', () => {
    const ids = ['a', 'b', 'c'];
    expect(reorderTarget(ids, 'b', -1)).toEqual({ beforeId: 'a' });
    expect(reorderTarget(ids, 'a', 1)).toEqual({ beforeId: 'c' });
    expect(reorderTarget(ids, 'b', 1)).toEqual({ beforeId: null });
    expect(reorderTarget(ids, 'a', -1)).toBeNull();
    expect(reorderTarget(ids, 'c', 1)).toBeNull();
    expect(reorderTarget(ids, 'x', 1)).toBeNull();
  });

  it('labels downloads like Arc (Image, PDF, Video, …)', () => {
    expect(fileKindLabel('a.png')).toBe('Image');
    expect(fileKindLabel('clip.mov')).toBe('Video');
    expect(fileKindLabel('brand guide.pdf')).toBe('PDF');
    expect(fileKindLabel('Juno.dmg')).toBe('Disk Image');
    expect(fileKindLabel('song.mp3')).toBe('Audio');
    expect(fileKindLabel('notes.docx')).toBe('Document');
    expect(fileKindLabel('data.parquet')).toBe('PARQUET');
    expect(fileKindLabel('README')).toBe('File');
  });

  it('groups lists under Today, Yesterday and dates', () => {
    const now = new Date(2026, 10, 1, 15, 0).getTime();
    const hour = 3_600_000;
    expect(dayLabel(now - hour, now)).toBe('Today');
    expect(dayLabel(now - 24 * hour, now)).toBe('Yesterday');
    expect(dayLabel(now - 72 * hour, now)).not.toMatch(/Today|Yesterday/);
    const groups = groupByDay([now - hour, now - 2 * hour, now - 24 * hour], (t) => t, now);
    expect(groups.map(([label, items]) => [label, items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
    ]);
  });
});
