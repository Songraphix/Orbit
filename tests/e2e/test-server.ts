import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
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
  // Orbit Capture: a quote and a code block to select.
  '/research': page(
    'Layout Basics',
    '<p id="quote">Grids give rhythm. Use an 8 pt baseline.</p>' +
      '<pre><code id="code" class="language-ts">const grid = 8;</code></pre>',
  ),
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
  // The Toolkit (roadmap P3.5): known colours to pick and scan, and an image to inspect.
  '/colors': page(
    'Colours',
    '<style>html, body { margin: 0; background: #5b5bd6; color: #222222; min-height: 100vh; }</style>' +
      '<p>Plain text in a known colour.</p><img id="dot" src="/icon.png" alt="A dot">',
  ),
  // A responsive page (width=device-width), for responsive mode (roadmap P3.6).
  '/mobile':
    '<!doctype html><html><head><title>Mobile</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body><h1>Mobile</h1></body></html>',
  // A stand-in for a local development server (its page title is what Orbit shows).
  '/': page('Test Dev Server'),
  // The assistant (roadmap Phase 3): an article to summarize, ask about and make tasks from.
  '/article': page(
    'Grid Systems',
    '<nav><a href="/one">Home</a> <a href="/two">Menu link</a></nav>' +
      '<article><h2>Why grids</h2>' +
      '<p id="rhythm">Grids give a layout rhythm and make pages easier to scan.</p>' +
      '<p id="baseline">Use an 8 pt baseline so spacing stays consistent.</p>' +
      '<h2>Next steps</h2><ul><li>TODO: Audit the spacing on the pricing page.</li>' +
      '<li>TODO: Share the grid spec with the design team.</li></ul>' +
      '<p>' +
      'Long article text. '.repeat(30) +
      '</p></article>' +
      '<footer>Footer text</footer>',
  ),
  '/inbox': page('Inbox (12) - Mail'),
  '/boost': page(
    'Boost Me',
    `<div id="banner" style="height:80px;background:#fc0">Ad banner</div>
     <p class="story">The story</p>`,
  ),
};

export type TestServer = {
  url: (path: string) => string;
  close: () => Promise<void>;
  /** The last request the stand-in Anthropic API received (headers and JSON body). */
  lastAiRequest: () => { headers: Record<string, unknown>; body: Record<string, unknown> } | null;
  /** Every request the stand-in API received, oldest first. */
  aiRequests: () => { headers: Record<string, unknown>; body: Record<string, unknown> }[];
  /** The Authorization header of the last request to the stand-in GitHub API ('' = none). */
  lastGithubAuth: () => string;
};

type FakeBlock =
  | { type: 'text'; text: string }
  | {
      type: 'document';
      title?: string;
      source:
        | { type: 'content'; content: { type: 'text'; text: string }[] }
        | { type: 'text'; data: string };
    };
type FakeRequest = {
  model: string;
  stream?: boolean;
  tools?: { name: string }[];
  output_config?: { format?: unknown };
  messages: { role: string; content: string | FakeBlock[] }[];
};

/** Tidy: groups tabs whose titles start with "Page" into "Pages". */
function tidyAnswer(body: FakeRequest): string {
  const first = body.messages[0]?.content;
  const lines = String(typeof first === 'string' ? first : '')
    .split('\n')
    .slice(1);
  const pages = lines.filter((l) => / \| Page /.test(l)).map((l) => l.split(' | ')[0]!);
  return JSON.stringify({ groups: [{ name: 'Pages', tabs: pages }] });
}

const blocksOf = (body: FakeRequest) =>
  body.messages.flatMap((m) => (typeof m.content === 'string' ? [] : m.content));
const docText = (doc: Extract<FakeBlock, { type: 'document' }>) =>
  doc.source.type === 'content'
    ? doc.source.content.map((b) => b.text).join('\n')
    : doc.source.data;

/** Tasks: each "TODO:" line in the text, or one task when there are none. */
function fakeTasks(body: FakeRequest) {
  const text = blocksOf(body)
    .map((b) => (b.type === 'document' ? docText(b) : ''))
    .join('\n');
  const todos = [...text.matchAll(/TODO: ([^\n]+)/g)].map((m) => m[1]!.trim());
  return (todos.length ? todos : ['Read it again']).map((title) => ({ title, notes: '' }));
}

/**
 * The assistant's answers, streamed as the API streams them: an opening line, then one cited
 * claim per document (a page's passage that mentions "Grids", or a finding's first words).
 * A question containing SLOW streams slowly (for Stop).
 */
function streamAnswer(body: FakeRequest, res: ServerResponse) {
  if (coworkerAnswer(body, res)) return;
  const docs = blocksOf(body).filter(
    (b): b is Extract<FakeBlock, { type: 'document' }> => b.type === 'document',
  );
  const last = body.messages.at(-1)?.content;
  const question =
    typeof last === 'string'
      ? last
      : (last ?? []).map((b) => (b.type === 'text' ? b.text : '')).join(' ');
  type Piece = { text: string; citation?: Record<string, unknown> };
  const pieces: Piece[] = [
    { text: docs.length ? 'Here is what I found. ' : `You asked: ${question}` },
  ];
  docs.slice(0, 3).forEach((doc, index) => {
    if (doc.source.type === 'content') {
      const blocks = doc.source.content;
      const at = Math.max(
        0,
        blocks.findIndex((b) => b.text.includes('Grids')),
      );
      pieces.push({
        text: `Grids give rhythm (from ${doc.title ?? 'the page'}). `,
        citation: {
          type: 'content_block_location',
          cited_text: blocks[at]?.text ?? '',
          document_index: index,
          document_title: doc.title ?? null,
          start_block_index: at,
          end_block_index: at + 1,
        },
      });
    } else {
      const data = doc.source.data;
      pieces.push({
        text: `A finding says so (${doc.title ?? 'finding'}). `,
        citation: {
          type: 'char_location',
          cited_text: data.slice(0, 30),
          document_index: index,
          document_title: doc.title ?? null,
          start_char_index: 0,
          end_char_index: Math.min(30, data.length),
          file_id: null,
        },
      });
    }
  });
  if (/SLOW/.test(question)) {
    pieces.push(...Array.from({ length: 40 }, (_, i) => ({ text: `word${i} ` })));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: Record<string, unknown>) =>
    res.write(`event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}\n\n`);
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_stream',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 1 },
      },
    },
  ];
  pieces.forEach((piece, index) => {
    events.push(
      {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '', citations: null },
      },
      { type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece.text } },
    );
    if (piece.citation) {
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'citations_delta', citation: piece.citation },
      });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 80 },
    },
    { type: 'message_stop' },
  );
  const slow = /SLOW/.test(question);
  let i = 0;
  const next = () => {
    if (res.destroyed) return;
    if (i >= events.length) {
      res.end();
      return;
    }
    send(events[i++]!);
    if (slow) setTimeout(next, 120);
    else next();
  };
  next();
}

/**
 * Orbit AI as a coworker: a question containing COWORKER (with tools offered) first calls
 * list_tasks and create_task — inputs streamed in pieces, as the API streams them — then, given
 * the results, answers with what it found.
 */
function coworkerAnswer(body: FakeRequest, res: ServerResponse): boolean {
  const asked = JSON.stringify(body.messages);
  if (!asked.includes('COWORKER') || !body.tools?.length) return false;
  const last = body.messages.at(-1)?.content;
  const results =
    typeof last === 'string'
      ? []
      : (last ?? []).filter((b) => b.type === ('tool_result' as string));
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_tools',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 1 },
      },
    },
  ];
  if (results.length === 0) {
    events.push(
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Let me check. ' },
      },
      { type: 'content_block_stop', index: 0 },
    );
    const calls = [
      { id: 'toolu_list', name: 'list_tasks', json: ['{"filter":', '"today"}'] },
      {
        id: 'toolu_add',
        name: 'create_task',
        json: ['{"title":"Call the ', 'printer","priority":"high"}'],
      },
    ];
    calls.forEach((call, i) => {
      const index = i + 1;
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} },
      });
      for (const part of call.json) {
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: part },
        });
      }
      events.push({ type: 'content_block_stop', index });
    });
    events.push({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 60 },
    });
  } else {
    // Proof the results came back: the titles of today's tasks it was given.
    const listed = JSON.stringify(results);
    const titles = [...listed.matchAll(/\\"title\\":\\"([^\\]+)\\"/g)].map((m) => m[1]);
    const text = `Today you have: ${titles.join(', ') || 'nothing'}. I added “Call the printer”.`;
    events.push(
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 30 },
      },
    );
  }
  events.push({ type: 'message_stop' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const event of events) {
    res.write(`event: ${String(event['type'])}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
  return true;
}

/** Serves a few static pages on 127.0.0.1 so tests never depend on the internet. */
export async function startTestServer(): Promise<TestServer> {
  // /feed.xml grows by one post each time /feed/publish is requested (Live Folder tests).
  let posts = 2;
  const feed = () =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Test Feed</title>${Array.from(
      { length: posts },
      (_, i) =>
        `<item><title>Post ${i + 1}</title><link>/post/${i + 1}</link><guid>post-${i + 1}</guid>` +
        `<pubDate>${new Date(Date.UTC(2026, 9, 1 + i)).toUTCString()}</pubDate></item>`,
    ).join('')}</channel></rss>`;
  let lastAiRequest: ReturnType<TestServer['lastAiRequest']> = null;
  const aiRequests: NonNullable<ReturnType<TestServer['lastAiRequest']>>[] = [];
  let lastGithubAuth = '';
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/v1/messages' && req.method === 'POST') {
      // A stand-in for the Anthropic Messages API: Tidy's structured answer, the assistant's
      // streamed answers with citations, and tasks drawn from text.
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const body = JSON.parse(raw) as FakeRequest;
        lastAiRequest = { headers: req.headers, body: body as Record<string, unknown> };
        aiRequests.push(lastAiRequest);
        if (body.stream) {
          streamAnswer(body, res);
          return;
        }
        const text = JSON.stringify(body.output_config?.format ?? {}).includes('"tasks"')
          ? JSON.stringify({ tasks: fakeTasks(body) })
          : tidyAnswer(body);
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: body.model,
            content: [{ type: 'text', text }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
        );
      });
      return;
    }
    if (path === '/feed.xml') {
      res.writeHead(200, { 'content-type': 'application/rss+xml' }).end(feed());
      return;
    }
    if (path === '/feed/publish') {
      posts++;
      res.writeHead(204).end();
      return;
    }
    if (path === '/blog') {
      // A site that advertises its feed (the user types the site, Orbit finds the feed).
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(
          '<html><head><title>Blog</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body>Blog</body></html>',
        );
      return;
    }
    if (path.startsWith('/post/')) {
      res.writeHead(200, { 'content-type': 'text/html' }).end(page(`Post ${path.slice(6)}`));
      return;
    }
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
    if (path === '/big.bin') {
      // 3 MB over about 1.5 s, so a download is seen in progress.
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(30 * 102_400),
        'content-disposition': 'attachment; filename="big.bin"',
      });
      let sent = 0;
      const timer = setInterval(() => {
        res.write(Buffer.alloc(102_400, 7));
        if (++sent === 30) {
          clearInterval(timer);
          res.end();
        }
      }, 50);
      req.on('close', () => clearInterval(timer));
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
    // A stand-in for GitHub's REST API (roadmap P4.2): acme/site has two open pull requests and
    // one issue (its issues list also holds a pull request, as GitHub's does).
    const github = /^\/repos\/([^/]+\/[^/]+)\/(pulls|issues)$/.exec(path);
    if (github) {
      lastGithubAuth = String(req.headers.authorization ?? '');
      if (github[1] !== 'acme/site') {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"message":"Not Found"}');
        return;
      }
      const item = (n: number, title: string, kind: 'pull' | 'issues', extra = {}) => ({
        number: n,
        title,
        html_url: `https://github.com/acme/site/${kind}/${n}`,
        user: { login: 'sam' },
        labels: [{ name: kind === 'pull' ? 'feature' : 'bug' }],
        updated_at: '2026-11-01T10:00:00Z',
        comments: 1,
        ...extra,
      });
      const body =
        github[2] === 'pulls'
          ? [item(7, 'Add dark mode', 'pull'), item(8, 'Faster images', 'pull', { draft: true })]
          : [
              item(9, 'Footer overlaps on mobile', 'issues'),
              item(7, 'Add dark mode', 'pull', { pull_request: {} }),
            ];
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      return;
    }
    if (path === '/data.json') {
      // JSON responses show as a tree (roadmap P3.6).
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          name: 'Orbit',
          tags: ['browser', 'notes'],
          site: 'https://example.com/',
        }),
      );
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
    lastAiRequest: () => lastAiRequest,
    aiRequests: () => aiRequests,
    lastGithubAuth: () => lastGithubAuth,
  };
}
