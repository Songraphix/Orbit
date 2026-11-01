import { describe, expect, it } from 'vitest';
import {
  cleanProfilePatch,
  defaultProfileColor,
  greetingFor,
  isEmoji,
  PROFILE_COLORS,
  profileInitials,
} from '@shared/profile';

describe('profile helpers', () => {
  it('makes initials from one or more words', () => {
    expect(profileInitials('Work Stuff')).toBe('WS');
    expect(profileInitials('joseph')).toBe('J');
    expect(profileInitials('  a b c ')).toBe('AC');
    expect(profileInitials('')).toBe('?');
  });

  it('gives each profile a stable colour of ours', () => {
    expect(PROFILE_COLORS).toContain(defaultProfileColor('default'));
    expect(defaultProfileColor('abc')).toBe(defaultProfileColor('abc'));
  });

  it('accepts one emoji as an avatar, not text', () => {
    expect(isEmoji('🚀')).toBe(true);
    expect(isEmoji('🧑‍💻')).toBe(true);
    expect(isEmoji('☕️')).toBe(true);
    expect(isEmoji('🚀🚀')).toBe(false);
    expect(isEmoji('A')).toBe(false);
    expect(isEmoji('')).toBe(false);
  });

  it('cleans a patch before it is stored', () => {
    expect(
      cleanProfilePatch({
        name: '  Work ',
        displayName: ' Joseph ',
        avatar: '🎨',
        color: '#30a46c',
      }),
    ).toEqual({ name: 'Work', displayName: 'Joseph', avatar: '🎨', color: '#30a46c' });
    expect(cleanProfilePatch({ name: '   ', avatar: 'hello', color: 'red' })).toEqual({});
    expect(cleanProfilePatch({ avatar: '', displayName: '' })).toEqual({
      avatar: '',
      displayName: '',
    });
  });

  it('greets by the hour', () => {
    expect(greetingFor(3)).toBe('Good night');
    expect(greetingFor(9)).toBe('Good morning');
    expect(greetingFor(14)).toBe('Good afternoon');
    expect(greetingFor(19)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good night');
  });
});
