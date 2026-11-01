import { describe, expect, it } from 'vitest';
import { chromeUserAgent } from '../../src/main/app/user-agent';

describe('chromeUserAgent', () => {
  it('matches Chrome’s reduced macOS user agent', () => {
    expect(chromeUserAgent('156.0.8078.75')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    );
  });

  it('never mentions Electron or Orbit', () => {
    expect(chromeUserAgent('156.0.1.2')).not.toMatch(/Electron|Orbit/);
  });
});
