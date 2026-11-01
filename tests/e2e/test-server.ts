import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A 1×1 PNG, served as the test pages' favicon. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const page = (title: string, body = '') =>
  `<!doctype html><html><head><title>${title}</title><link rel="icon" href="/icon.png"></head>` +
  `<body><h1>${title}</h1>${body}</body></html>`;

const ROUTES: Record<string, string> = {
  '/one': page(
    'Page One',
    '<a id="popup" href="/two" target="_blank">open two</a> <a id="next" href="/three">three</a>',
  ),
  '/two': page('Page Two'),
  // A link to another site (localhost ≠ 127.0.0.1) that opens a new tab: Peek from pinned tabs.
  '/peek': page(
    'Peek Source',
    `<a id="out" target="_blank">elsewhere</a>
     <script>
       document.getElementById('out').href =
         location.href.replace('127.0.0.1', 'localhost').replace('/peek', '/two');
     </script>`,
  ),
  '/notify': page(
    'Notify',
    `<button id="ask" onclick="Notification.requestPermission().then((p) => { document.title = 'perm:' + p; })">Ask</button>`,
  ),
  '/audio': page(
    'Song',
    `<audio id="a" loop></audio>
     <button id="play" onclick="document.getElementById('a').play()">Play</button>
     <script>
       // One second of silence as a WAV, built in the page (no files needed).
       const rate = 8000, n = rate, b = new ArrayBuffer(44 + n), v = new DataView(b);
       const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
       w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
       v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
       v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
       w(36, 'data'); v.setUint32(40, n, true); for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
       document.getElementById('a').src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
     </script>`,
  ),
  '/words': page('Words', '<p>orbit one, orbit two, orbit three. Arc.</p>'),
  // Mimics a video player's fullscreen button.
  '/video': page(
    'Video',
    `<div id="player" style="width:320px;height:180px;background:#000"></div>
     <button id="fs" onclick="document.getElementById('player').requestFullscreen()">Fullscreen</button>`,
  ),
  // Mimics "Sign in with Google": a sized popup that reports back through window.opener.
  '/opener': page(
    'Opener',
    `<button id="signin" onclick="window.open('/popup', 'signin', 'width=480,height=600')">Sign in</button>
     <script>addEventListener('message', (e) => { document.title = 'got:' + e.data; });</script>`,
  ),
  '/popup': page(
    'Sign-in popup',
    `<script>
       window.opener && window.opener.postMessage('signed-in', '*');
       setTimeout(() => window.close(), 1500);
     </script>`,
  ),
  '/three': page('Page Three'),
  '/boost': page(
    'Boost Me',
    `<div id="banner" style="height:80px;background:#fc0">Ad banner</div>
     <p class="story">The story</p>`,
  ),
};

export type TestServer = { url: (path: string) => string; close: () => Promise<void> };

/** Serves a few static pages on 127.0.0.1 so tests never depend on the internet. */
export async function startTestServer(): Promise<TestServer> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/auth') {
      // HTTP Basic auth: user "orbit", password "s3cret".
      const expected = `Basic ${Buffer.from('orbit:s3cret').toString('base64')}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="Orbit test"' }).end('nope');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(page('Secret'));
      return;
    }
    if (path === '/cookie') {
      // Sets a cookie on ?set=…, and always shows what the browser sent back.
      const set = new URL(req.url ?? '/', 'http://x').searchParams.get('set');
      const headers: Record<string, string> = { 'content-type': 'text/html' };
      if (set) headers['set-cookie'] = `who=${set}; Path=/`;
      res.writeHead(200, headers).end(page(`cookie:${req.headers.cookie ?? 'none'}`));
      return;
    }
    if (path === '/report.txt') {
      res
        .writeHead(200, {
          'content-type': 'text/plain',
          'content-disposition': 'attachment; filename="report.txt"',
        })
        .end('Orbit download test\n');
      return;
    }
    if (path === '/icon.png') {
      res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
      return;
    }
    const html = ROUTES[path];
    if (!html) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
