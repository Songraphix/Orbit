import { describe, expect, it } from 'vitest';
import { CHANNEL_NAME_PATTERN, contract } from '@shared/ipc/contract';

describe('IPC contract', () => {
  it('names every channel as domain:verb', () => {
    for (const channel of Object.keys(contract)) {
      expect(channel).toMatch(CHANNEL_NAME_PATTERN);
    }
  });

  it('accepts valid names and rejects invalid ones', () => {
    expect('tabs:activate').toMatch(CHANNEL_NAME_PATTERN);
    expect('spaces:setProfile').toMatch(CHANNEL_NAME_PATTERN);
    expect('tabs').not.toMatch(CHANNEL_NAME_PATTERN);
    expect('Tabs:activate').not.toMatch(CHANNEL_NAME_PATTERN);
    expect('tabs:activate:now').not.toMatch(CHANNEL_NAME_PATTERN);
  });
});
