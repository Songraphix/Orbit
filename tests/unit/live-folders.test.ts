import { describe, expect, it } from 'vitest';
import { itemDataSchema, liveSourceSchema } from '@shared/types/live-folders';
import {
  decodeEntities,
  discoverFeedUrl,
  feedInputUrl,
  githubRepo,
  latest,
  parseFeed,
  planRefresh,
} from '../../src/main/live-folders/model';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Orbit &amp; Friends</title>
  <link>https://blog.example.com/</link>
  <item>
    <title><![CDATA[Hello <b>world</b>]]></title>
    <link>https://blog.example.com/hello</link>
    <guid isPermaLink="false">post-1</guid>
    <pubDate>Sat, 01 Nov 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Relative &#8216;link&#8217;</title>
    <link>/second</link>
    <pubDate>Fri, 31 Oct 2026 09:00:00 GMT</pubDate>
  </item>
  <item><title>No link at all</title></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Release notes</title>
  <link href="https://example.com/"/>
  <entry>
    <title>v1.2 &lt;beta&gt;</title>
    <link rel="replies" href="https://example.com/v1.2#comments"/>
    <link rel="alternate" href="https://example.com/v1.2"/>
    <id>tag:example.com,2026:v1.2</id>
    <updated>2026-10-30T10:00:00Z</updated>
  </entry>
</feed>`;

describe('feeds', () => {
  it('reads RSS: titles, absolute links, guids, dates; skips items without a link', () => {
    const feed = parseFeed(RSS, 'https://blog.example.com/feed.xml')!;
    expect(feed.title).toBe('Orbit & Friends');
    expect(feed.items).toEqual([
      {
        guid: 'post-1',
        title: 'Hello world',
        url: 'https://blog.example.com/hello',
        date: Date.UTC(2026, 10, 1, 9),
      },
      {
        guid: 'https://blog.example.com/second',
        title: 'Relative ‘link’',
        url: 'https://blog.example.com/second',
        date: Date.UTC(2026, 9, 31, 9),
      },
    ]);
  });

  it('reads Atom: the alternate link and the entry id', () => {
    const feed = parseFeed(ATOM, 'https://example.com/atom')!;
    expect(feed.title).toBe('Release notes');
    expect(feed.items).toEqual([
      {
        guid: 'tag:example.com,2026:v1.2',
        title: 'v1.2 <beta>',
        url: 'https://example.com/v1.2',
        date: Date.UTC(2026, 9, 30, 10),
      },
    ]);
  });

  it('rejects documents that are not feeds, and links that are not web pages', () => {
    expect(parseFeed('<html><title>Hi</title></html>', 'https://x.com/')).toBeNull();
    const evil =
      '<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>';
    expect(parseFeed(evil, 'https://x.com/')!.items).toEqual([]);
  });

  it('finds a site’s feed from its HTML', () => {
    const html = `<head><link rel="stylesheet" href="/a.css">
      <link type="application/atom+xml" rel="alternate" href="/feed.atom" title="Feed"></head>`;
    expect(discoverFeedUrl(html, 'https://example.com/blog/')).toBe(
      'https://example.com/feed.atom',
    );
    expect(discoverFeedUrl('<head></head>', 'https://example.com/')).toBeNull();
  });

  it('decodes entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#39;d&#39; &#x2014; &bogus;')).toBe(
      "a & b <c> 'd' — &bogus;",
    );
  });
});

describe('Live Folder inputs and refreshes', () => {
  it('accepts what people type for a feed or a repo', () => {
    expect(feedInputUrl('blog.example.com/feed')).toBe('https://blog.example.com/feed');
    expect(feedInputUrl('http://x.com/rss')).toBe('http://x.com/rss');
    expect(feedInputUrl('not a url')).toBeNull();
    expect(feedInputUrl('file:///etc/passwd')).toBeNull();
    expect(githubRepo('Songraphix/Arc')).toBe('Songraphix/Arc');
    expect(githubRepo('https://github.com/electron/electron/pulls')).toBe('electron/electron');
    expect(githubRepo('github.com/vercel/next.js.git')).toBe('vercel/next.js');
    expect(githubRepo('example.com/foo')).toBeNull();
    expect(githubRepo('just-words')).toBeNull();
  });

  it('keeps the newest items, once each', () => {
    const items = [
      { guid: 'a', title: 'A', url: 'https://x/a', date: 1 },
      { guid: 'b', title: 'B', url: 'https://x/b', date: 3 },
      { guid: 'a', title: 'A again', url: 'https://x/a', date: 2 },
      { guid: 'c', title: 'C', url: 'https://x/c', date: null },
    ];
    expect(latest(items, 2).map((i) => i.guid)).toEqual(['b', 'a']);
  });

  it('adds new items and removes gone ones, but never an open tab', () => {
    const fetched = [
      { guid: 'new', title: 'New', url: 'https://x/new', date: 3 },
      { guid: 'kept', title: 'Kept', url: 'https://x/kept', date: 2 },
    ];
    const children = [
      { id: '1', guid: 'kept', open: false },
      { id: '2', guid: 'gone', open: false },
      { id: '3', guid: 'gone-but-open', open: true },
    ];
    expect(planRefresh(children, fetched)).toEqual({ add: [fetched[0]], remove: ['2'] });
  });

  it('validates stored data', () => {
    expect(liveSourceSchema.safeParse({ type: 'rss', url: 'https://x.com/feed' }).success).toBe(
      true,
    );
    expect(liveSourceSchema.safeParse({ type: 'github', repo: 'a/b', what: 'pulls' }).success).toBe(
      true,
    );
    expect(
      liveSourceSchema.safeParse({ type: 'github', repo: '../etc', what: 'pulls' }).success,
    ).toBe(false);
    expect(itemDataSchema.safeParse({ feed: { guid: 'x', unread: true } }).success).toBe(true);
  });
});
