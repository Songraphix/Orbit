import { describe, expect, it } from 'vitest';
import { decide, describePermission, permissionKey } from '../../src/main/permissions/policy';

describe('permission policy', () => {
  it('allows harmless permissions without asking', () => {
    expect(decide('fullscreen', 'https://youtube.com', null)).toBe('allow');
    expect(decide('clipboard-sanitized-write', 'https://a.com', null)).toBe('allow');
  });

  it('asks for sensitive ones on secure sites, then honours the remembered answer', () => {
    expect(decide('media', 'https://meet.google.com', null)).toBe('ask');
    expect(decide('notifications', 'https://mail.google.com', 'allow')).toBe('allow');
    expect(decide('geolocation', 'https://maps.google.com', 'deny')).toBe('deny');
    expect(decide('media', 'http://localhost:3000', null)).toBe('ask'); // localhost is secure
  });

  it('refuses insecure origins, internal pages and unknown permissions', () => {
    expect(decide('media', 'http://example.com', null)).toBe('deny');
    expect(decide('notifications', 'orbit://newtab', null)).toBe('deny');
    expect(decide('notifications', null, null)).toBe('deny');
    expect(decide('openExternal', 'https://a.com', null)).toBe('deny');
    expect(decide('midiSysex', 'https://a.com', 'allow')).toBe('deny');
  });

  it('words prompts naturally and keys camera and mic separately', () => {
    expect(describePermission('media', ['video', 'audio'])).toBe('use your camera and microphone');
    expect(describePermission('notifications')).toBe('show notifications');
    expect(permissionKey('media', ['video', 'audio'])).toBe('perm:media:audio+video');
    expect(permissionKey('media', ['audio'])).toBe('perm:media:audio');
    expect(permissionKey('geolocation')).toBe('perm:geolocation');
  });
});
