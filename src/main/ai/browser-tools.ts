import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import type { ToolOutcome } from './work-tools';
import { linkNeedsConfirmation } from './browser-policy';

/**
 * Orbit AI's browser tools (roadmap R2 M2): a small allowlist of things Claude may look at or
 * do in your browser when a question needs it — your open tabs, apps, history and notes; switch
 * tab, open a site, search, open an app, open or write a note. Every input is model output, so
 * each is checked against its schema here; nothing runs code, touches files or closes anything.
 * Links to sites that don't come from you (your words, tabs, apps or history) aren't opened:
 * they wait in the answer for you to click (a page read for you could otherwise use a link to
 * send your data somewhere).
 */

const ids = z.string().min(1).max(64);

const inputs = {
  list_tabs: z.object({
    scope: z.enum(['this_space', 'all_spaces']).optional(),
  }),
  switch_to_tab: z.object({ tab_id: ids }),
  open_url: z.object({
    url: z.string().min(1).max(2000),
    beside: z.boolean().optional().describe('Open it in split view beside the current page'),
  }),
  search_web: z.object({ query: z.string().min(1).max(300) }),
  list_apps: z.object({}),
  open_app: z.object({ app_id: ids }),
  search_history: z.object({
    query: z.string().max(200).optional(),
    days_ago: z
      .number()
      .int()
      .min(0)
      .max(90)
      .optional()
      .describe('Only pages last visited on that day (0 = today, 1 = yesterday)'),
  }),
  search_notes: z.object({ query: z.string().max(200).optional() }),
  read_note: z.object({ note_id: ids }),
  open_note: z.object({ note_id: ids }),
  create_note: z.object({
    title: z.string().min(1).max(120),
    text: z.string().max(20_000).describe('The note in Markdown'),
  }),
  search_drive: z.object({ query: z.string().max(200) }),
  read_drive_file: z.object({ file_id: z.string().min(1).max(200) }),
} as const;
export type BrowserToolName = keyof typeof inputs;

const DESCRIPTIONS: Record<BrowserToolName, string> = {
  list_tabs:
    'List the user’s open tabs (pinned, today’s and favourites) with ids, titles and addresses, and which one is showing. Default: this Space.',
  switch_to_tab: 'Show one of the user’s open tabs (an id from list_tabs).',
  open_url:
    'Open a web address (http or https) in a new tab, or beside the current page. Sites the user didn’t mention and hasn’t visited are offered as a link for them to click instead.',
  search_web: 'Search the web with the user’s search engine, in a new tab.',
  list_apps:
    'List the user’s apps (their favourites): ids, names, addresses, and where each opens (a tab, the side panel beside the page, or its own window).',
  open_app:
    'Open one of the user’s apps the way it’s set to open (an id from list_apps) — e.g. “open Spotify in the sidebar”.',
  search_history:
    'Search the pages the user visited: by words in the title or address, and/or the day they last visited it.',
  search_notes:
    'Find the user’s notes in Orbit (titles and the start of each), newest first; with a query, those containing it.',
  read_note: 'Read one of the user’s notes in full (an id from search_notes).',
  open_note: 'Open one of the user’s notes in the side panel beside the page.',
  create_note:
    'Save a new note in Orbit (Markdown: headings, lists, links). Use when the user asks to save or note something.',
  search_drive:
    'Search the user’s Google Drive (read-only): files whose name or text contains the words — ids, names, kinds (Google Docs, Sheets, PDF…), when edited, and links.',
  read_drive_file:
    'Read a Google Drive file’s text (an id from search_drive): Google Docs, Sheets (as CSV), Slides and text files. Name the file and give its link when you use it.',
};

/** Which tools need which permission (Settings → AI → What Orbit AI can use). */
const NEEDS: Record<BrowserToolName, 'browser' | 'history' | 'notes' | 'drive'> = {
  list_tabs: 'browser',
  switch_to_tab: 'browser',
  open_url: 'browser',
  search_web: 'browser',
  list_apps: 'browser',
  open_app: 'browser',
  search_history: 'history',
  search_notes: 'notes',
  read_note: 'notes',
  open_note: 'notes',
  create_note: 'notes',
  search_drive: 'drive',
  read_drive_file: 'drive',
};

export type BrowserAccess = { browser: boolean; history: boolean; notes: boolean; drive: boolean };

export type TabInfo = {
  id: string;
  title: string;
  url: string;
  showing: boolean;
  section: 'pinned' | 'today' | 'favorite';
  space: string;
};
export type AppInfo = { id: string; name: string; url: string; opens_in: string };
export type VisitInfo = { title: string; url: string; lastVisitAt: number };
export type NoteInfo = { id: string; title: string; preview: string; updatedAt: number };

export type BrowserToolDeps = {
  tabs: (scope: 'this_space' | 'all_spaces') => TabInfo[];
  /** Shows a tab (switching Space if needed); false if it's gone. */
  switchTo: (tabId: string) => boolean;
  openUrl: (url: string, beside: boolean) => void;
  /** Opens the search; returns its address. */
  search: (query: string) => string;
  apps: () => AppInfo[];
  openApp: (appId: string) => boolean;
  history: {
    search: (query: string, limit: number) => VisitInfo[];
    between: (from: number, to: number, limit: number) => VisitInfo[];
    /** Whether a host was visited before (links to it open without asking). */
    knows: (host: string) => boolean;
  };
  notes: {
    list: (query: string) => NoteInfo[];
    read: (id: string) => { title: string; text: string } | null;
    open: (id: string) => boolean;
    create: (title: string, markdown: string) => string;
  };
  /** What the user typed or said in this question (links they named open directly). */
  userWords: string;
  /** Google Drive, when it's connected. */
  drive?: {
    search: (
      words: string,
    ) => Promise<
      { id: string; name: string; kind: string; modified: string | null; url: string | null }[]
    >;
    read: (fileId: string) => Promise<{
      name: string;
      kind: string;
      url: string | null;
      text: string | null;
      truncated: boolean;
    }>;
  };
  now?: () => number;
};

/** The tools Claude sees for what's allowed. */
export function browserTools(access: BrowserAccess): BetaToolUnion[] {
  return (Object.keys(inputs) as BrowserToolName[])
    .filter((name) => access[NEEDS[name]])
    .map((name) => {
      const { $schema: _, ...schema } = z.toJSONSchema(inputs[name], {
        target: 'draft-7',
      }) as Record<string, unknown>;
      return {
        name,
        description: DESCRIPTIONS[name],
        input_schema: schema as { type: 'object'; [key: string]: unknown },
        eager_input_streaming: true,
      };
    });
}

export function isBrowserTool(name: string): name is BrowserToolName {
  return name in inputs;
}

const error = (message: string): ToolOutcome => ({
  content: JSON.stringify({ error: message }),
  isError: true,
  action: null,
  changed: false,
});
const ok = (result: unknown, action: ToolOutcome['action']): ToolOutcome => ({
  content: JSON.stringify(result),
  isError: false,
  action,
  changed: false,
});
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
const DAY = 24 * 60 * 60 * 1000;
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** A web address Claude gave, if it is one (http/https only). Pure. */
export function webAddress(input: string): string | null {
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`,
    );
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

/** Runs one browser tool call, if it's allowed. Inputs are untrusted: each is checked. */
export async function runBrowserTool(
  name: BrowserToolName,
  input: unknown,
  access: BrowserAccess,
  deps: BrowserToolDeps,
): Promise<ToolOutcome> {
  if (!access[NEEDS[name]]) return error('The user hasn’t allowed this in Settings → AI');
  if (name === 'search_drive' || name === 'read_drive_file') {
    return runDriveTool(name, input, deps);
  }
  return runLocalTool(name, input, deps);
}

/** Drive: search, and read one file (its link is offered as the answer's source). */
async function runDriveTool(
  name: 'search_drive' | 'read_drive_file',
  input: unknown,
  deps: BrowserToolDeps,
): Promise<ToolOutcome> {
  const drive = deps.drive;
  if (!drive) return error('Google Drive isn’t connected (Settings → Integrations)');
  const parsed = inputs[name].safeParse(input);
  if (!parsed.success) {
    return error(`Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  try {
    if (name === 'search_drive') {
      const { query } = parsed.data as { query: string };
      const files = await drive.search(query);
      return ok(
        { files: files.slice(0, 15) },
        { kind: 'read', label: `Searched your Drive for “${clip(query, 40)}” (${files.length})` },
      );
    }
    const { file_id } = parsed.data as { file_id: string };
    const file = await drive.read(file_id);
    if (file.text === null) {
      return ok(
        { name: file.name, kind: file.kind, url: file.url, readable: false },
        { kind: 'read', label: `Couldn’t read “${clip(file.name, 50)}” (${file.kind})` },
      );
    }
    return ok(
      {
        name: file.name,
        kind: file.kind,
        url: file.url,
        text: clip(file.text, 60_000),
        ...(file.truncated || file.text.length > 60_000
          ? { note: 'Only the start of the file' }
          : {}),
      },
      file.url
        ? { kind: 'link', label: `Read “${clip(file.name, 50)}” · Open`, url: file.url }
        : { kind: 'read', label: `Read “${clip(file.name, 50)}”` },
    );
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Google Drive didn’t answer');
  }
}

function runLocalTool(
  name: Exclude<BrowserToolName, 'search_drive' | 'read_drive_file'>,
  input: unknown,
  deps: BrowserToolDeps,
): ToolOutcome {
  const parsed = inputs[name].safeParse(input);
  if (!parsed.success) {
    return error(`Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const data = parsed.data as Record<string, unknown>;
  const now = deps.now?.() ?? Date.now();
  switch (name) {
    case 'list_tabs': {
      const scope = (data['scope'] as 'this_space' | 'all_spaces' | undefined) ?? 'this_space';
      const tabs = deps.tabs(scope).slice(0, 80);
      return ok(
        { tabs: tabs.map((t) => ({ ...t, title: clip(t.title, 120) })) },
        { kind: 'read', label: `Looked at your tabs (${tabs.length})` },
      );
    }
    case 'switch_to_tab': {
      const id = data['tab_id'] as string;
      const tab = deps.tabs('all_spaces').find((t) => t.id === id);
      if (!tab || !deps.switchTo(id)) return error('No open tab has that id');
      return ok(
        { switched: true },
        { kind: 'update', label: `Switched to ${clip(tab.title, 60)}` },
      );
    }
    case 'open_url': {
      const url = webAddress(data['url'] as string);
      if (!url) return error('Only web addresses (http or https) can be opened');
      const known = deps.tabs('all_spaces').map((t) => t.url);
      const apps = deps.apps().map((a) => a.url);
      if (
        linkNeedsConfirmation(url, {
          userWords: deps.userWords,
          knownUrls: [...known, ...apps],
          visited: deps.history.knows,
        })
      ) {
        return ok(
          { opened: false, offered_as_link: true, note: 'The user can click the link to open it.' },
          { kind: 'link', label: `Open ${clip(host(url), 60)}`, url },
        );
      }
      deps.openUrl(url, Boolean(data['beside']));
      return ok(
        { opened: true },
        {
          kind: 'update',
          label: `Opened ${clip(host(url), 60)}${data['beside'] ? ' beside' : ''}`,
        },
      );
    }
    case 'search_web': {
      const query = data['query'] as string;
      deps.search(query);
      return ok({ searched: true }, { kind: 'update', label: `Searched for “${clip(query, 60)}”` });
    }
    case 'list_apps': {
      const apps = deps.apps();
      return ok({ apps }, { kind: 'read', label: `Looked at your apps (${apps.length})` });
    }
    case 'open_app': {
      const app = deps.apps().find((a) => a.id === data['app_id']);
      if (!app || !deps.openApp(app.id)) return error('No app has that id');
      return ok(
        { opened: true, opens_in: app.opens_in },
        { kind: 'update', label: `Opened ${app.name}` },
      );
    }
    case 'search_history': {
      const query = ((data['query'] as string | undefined) ?? '').trim();
      const daysAgo = data['days_ago'] as number | undefined;
      let visits: VisitInfo[];
      if (daysAgo !== undefined) {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const from = start.getTime() - daysAgo * DAY;
        const day = deps.history.between(from, from + DAY, 200);
        visits = query
          ? day.filter((v) => `${v.title} ${v.url}`.toLowerCase().includes(query.toLowerCase()))
          : day;
      } else if (query) visits = deps.history.search(query, 20);
      else visits = deps.history.between(now - DAY, now + 1, 20);
      const pages = visits.slice(0, 20).map((v) => ({
        title: clip(v.title, 120),
        url: v.url,
        last_visited: new Date(v.lastVisitAt).toISOString(),
      }));
      return ok(
        { pages },
        { kind: 'read', label: `Looked through your history (${pages.length} found)` },
      );
    }
    case 'search_notes': {
      const notes = deps.notes
        .list(((data['query'] as string | undefined) ?? '').trim())
        .slice(0, 20);
      return ok(
        {
          notes: notes.map((n) => ({
            id: n.id,
            title: n.title,
            start: clip(n.preview, 160),
            updated: new Date(n.updatedAt).toISOString(),
          })),
        },
        { kind: 'read', label: `Looked at your notes (${notes.length})` },
      );
    }
    case 'read_note': {
      const note = deps.notes.read(data['note_id'] as string);
      if (!note) return error('No note has that id');
      return ok(
        { title: note.title, text: clip(note.text, 12_000) },
        { kind: 'read', label: `Read “${clip(note.title, 60)}”` },
      );
    }
    case 'open_note': {
      const note = deps.notes.read(data['note_id'] as string);
      if (!note || !deps.notes.open(data['note_id'] as string)) return error('No note has that id');
      return ok(
        { opened: true },
        { kind: 'update', label: `Opened “${clip(note.title, 60)}” beside the page` },
      );
    }
    case 'create_note': {
      const title = (data['title'] as string).trim();
      deps.notes.create(title, data['text'] as string);
      return {
        ...ok({ saved: true }, { kind: 'create', label: `Saved the note “${clip(title, 60)}”` }),
        changed: false,
      };
    }
  }
}
