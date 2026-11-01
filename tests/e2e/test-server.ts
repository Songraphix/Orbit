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
  '/three': page('Page Three'),
};

export type TestServer = { url: (path: string) => string; close: () => Promise<void> };

/** Serves a few static pages on 127.0.0.1 so tests never depend on the internet. */
export async function startTestServer(): Promise<TestServer> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
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
