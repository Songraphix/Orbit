import { describe, expect, it } from 'vitest';
import { progressLabel, timeLeftLabel } from '@shared/download-format';
import { nextSpeed } from '../../src/main/downloads/model';

const MB = 1024 ** 2;

describe('download progress like Arc', () => {
  it('shows received/total in the total’s unit', () => {
    expect(progressLabel(176.8 * MB, 320.7 * MB)).toBe('176.8/320.7 MB');
    expect(progressLabel(1.5 * 1024 ** 3, 4 * 1024 ** 3)).toBe('1.5/4.0 GB');
    expect(progressLabel(300 * 1024, 900 * 1024)).toBe('300/900 KB');
    expect(progressLabel(12.4 * MB, 0)).toBe('12.4 MB');
  });

  it('tells the time left', () => {
    expect(timeLeftLabel(14 * MB, MB)).toBe('14s');
    expect(timeLeftLabel(180 * MB, MB)).toBe('3m');
    expect(timeLeftLabel(3900 * MB, MB)).toBe('1h 5m');
    expect(timeLeftLabel(MB, null)).toBeNull();
    expect(timeLeftLabel(0, MB)).toBeNull();
  });

  it('smooths the speed', () => {
    expect(nextSpeed(null, { bytes: 100, at: 1000 }, null)).toBeNull();
    expect(nextSpeed(null, { bytes: 2 * MB, at: 2000 }, { bytes: MB, at: 1000 })).toBe(MB);
    // A sudden burst moves the estimate only part of the way.
    expect(nextSpeed(MB, { bytes: 6 * MB, at: 3000 }, { bytes: 2 * MB, at: 2000 })).toBeCloseTo(
      0.7 * MB + 0.3 * 4 * MB,
    );
    expect(nextSpeed(MB, { bytes: 1, at: 1000 }, { bytes: 1, at: 1000 })).toBe(MB);
  });
});
