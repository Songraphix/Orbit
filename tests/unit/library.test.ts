import { describe, expect, it } from 'vitest';
import {
  captureFileName,
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
});
