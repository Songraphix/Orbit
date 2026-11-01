import { describe, expect, it } from 'vitest';
import { isLocalDev, siteSettingRows, storedValueFor } from '../../src/main/site-controls/model';

describe('site settings rows', () => {
  it('shows defaults for a site with nothing stored', () => {
    const rows = siteSettingRows({}, 'https://example.com/');
    expect(rows.map((r) => [r.label, r.valueLabel])).toEqual([
      ['Notifications', 'Ask'],
      ['Preview', 'Enabled'],
      ['Developer Mode', 'Off'],
    ]);
  });

  it('reads stored values and adds camera / location once the site has asked', () => {
    const rows = siteSettingRows(
      {
        'perm:notifications': 'deny',
        peek: 'off',
        'perm:media:video': 'allow',
        'perm:geolocation': 'deny',
      },
      'https://meet.example.com/',
    );
    expect(rows.map((r) => [r.label, r.valueLabel])).toEqual([
      ['Notifications', 'Blocked'],
      ['Preview', 'Disabled'],
      ['Developer Mode', 'Off'],
      ['Camera', 'Allowed'],
      ['Location', 'Blocked'],
    ]);
  });

  it('suggests Developer Mode on local servers', () => {
    const dev = siteSettingRows({}, 'http://localhost:5173/').find((r) => r.key === 'devMode')!;
    expect(dev.valueLabel).toBe('Off — suggested for this site');
    const on = siteSettingRows({ devMode: 'on' }, 'http://localhost:5173/').find(
      (r) => r.key === 'devMode',
    )!;
    expect(on.valueLabel).toBe('On');
  });
});

describe('storedValueFor', () => {
  it('stores defaults as nothing and rejects unknown keys or values', () => {
    expect(storedValueFor('peek', 'on')).toEqual({ ok: true, stored: null });
    expect(storedValueFor('peek', 'off')).toEqual({ ok: true, stored: 'off' });
    expect(storedValueFor('perm:notifications', 'ask')).toEqual({ ok: true, stored: null });
    expect(storedValueFor('perm:notifications', 'allow')).toEqual({ ok: true, stored: 'allow' });
    expect(storedValueFor('zoom', '3')).toEqual({ ok: false, stored: null });
    expect(storedValueFor('peek', 'maybe')).toEqual({ ok: false, stored: null });
  });
});

describe('isLocalDev', () => {
  it('recognises local development servers', () => {
    expect(isLocalDev('http://localhost:3000/')).toBe(true);
    expect(isLocalDev('http://app.localhost/')).toBe(true);
    expect(isLocalDev('http://127.0.0.1:8080/x')).toBe(true);
    expect(isLocalDev('http://[::1]:8080/')).toBe(true);
    expect(isLocalDev('https://example.com/')).toBe(false);
    expect(isLocalDev('orbit://newtab')).toBe(false);
  });
});
