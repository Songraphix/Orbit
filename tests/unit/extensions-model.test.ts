import { describe, expect, it } from 'vitest';
import { pickIconPath, webStoreIdFrom } from '../../src/main/extensions/model';

const ID = 'gighmmpiobklfepjocnamgkkbiglidom';

describe('webStoreIdFrom', () => {
  it('reads the ID from Web Store pages, old and new', () => {
    expect(webStoreIdFrom(`https://chromewebstore.google.com/detail/adblock/${ID}`)).toBe(ID);
    expect(webStoreIdFrom(`https://chromewebstore.google.com/detail/${ID}?hl=en`)).toBe(ID);
    expect(webStoreIdFrom(`https://chrome.google.com/webstore/detail/x/${ID}`)).toBe(ID);
    expect(webStoreIdFrom(` ${ID} `)).toBe(ID);
  });

  it('rejects anything else', () => {
    expect(webStoreIdFrom(`http://chromewebstore.google.com/detail/x/${ID}`)).toBeNull();
    expect(webStoreIdFrom(`https://evil.example/detail/x/${ID}`)).toBeNull();
    expect(webStoreIdFrom('https://chromewebstore.google.com/category/extensions')).toBeNull();
    expect(webStoreIdFrom('not-an-id')).toBeNull();
    expect(webStoreIdFrom('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
  });
});

describe('pickIconPath', () => {
  it('prefers the toolbar icon, smallest at least the size', () => {
    const manifest = {
      icons: { '128': 'icon128.png' },
      action: { default_icon: { '16': 'a16.png', '32': 'a32.png', '48': 'a48.png' } },
    };
    expect(pickIconPath(manifest, 32)).toBe('a32.png');
    expect(pickIconPath(manifest, 64)).toBe('a48.png');
  });

  it('falls back to the general icons, MV2 browser_action and plain strings', () => {
    expect(pickIconPath({ icons: { '16': 's.png', '128': 'l.png' } }, 32)).toBe('l.png');
    expect(pickIconPath({ browser_action: { default_icon: 'b.png' } }, 32)).toBe('b.png');
    expect(pickIconPath({}, 32)).toBeNull();
  });
});
