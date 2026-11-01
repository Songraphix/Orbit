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
  '/notify': page(
    'Notify',
    `<button id="ask" onclick="Notification.requestPermission().then((p) => { document.title = 'perm:' + p; })">Ask</button>`,
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
