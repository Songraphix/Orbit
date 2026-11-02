/**
 * Moving tasks between Orbit and other task services (roadmap P4.3): export a project's tasks
 * as CSV (Asana, Linear, Todoist, ClickUp and Trello importers map its columns) or as a Markdown
 * checklist (Notion, Obsidian, GitHub, Things); import from either, or from a plain list. Pure.
 */

export type TransferTask = {
  title: string;
  description: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
};

const csvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const STATUS_WORDS: Record<TransferTask['status'], string> = {
  todo: 'To Do',
  doing: 'In Progress',
  done: 'Done',
};

export function tasksToCsv(tasks: readonly TransferTask[], project: string): string {
  const rows = [['Title', 'Description', 'Status', 'Priority', 'Due Date', 'Project']];
  for (const t of tasks) {
    rows.push([
      t.title,
      t.description,
      STATUS_WORDS[t.status],
      t.priority[0]!.toUpperCase() + t.priority.slice(1),
      t.dueDate ?? '',
      project,
    ]);
  }
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function tasksToMarkdown(tasks: readonly TransferTask[], project: string): string {
  const lines = [`# ${project}`, ''];
  for (const t of tasks) {
    const extras = [t.dueDate ? `due ${t.dueDate}` : '', t.priority === 'high' ? 'high' : '']
      .filter(Boolean)
      .join(', ');
    lines.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${extras ? ` (${extras})` : ''}`);
    for (const line of t.description.split('\n').filter((l) => l.trim())) {
      lines.push(`  ${line.trim()}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** RFC 4180-ish CSV: quoted cells, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** A due date as services write it: 2026-11-05, 2026-11-05T…, or 11/05/2026 (US order). */
export function readDate(value: string): string | null {
  const v = value.trim();
  const iso = DATE.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = SLASH_DATE.exec(v);
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  return null;
}

function readPriority(value: string): TransferTask['priority'] {
  const v = value.trim().toLowerCase();
  if (/^(high|urgent|p1|1|4|!!!)$/.test(v)) return 'high';
  if (/^(low|p4|p3)$/.test(v)) return 'low';
  return 'medium';
}

function readStatus(value: string): TransferTask['status'] {
  const v = value.trim().toLowerCase();
  if (/^(done|completed?|closed|x|yes|true|1)$/.test(v)) return 'done';
  if (/(progress|doing|started|active)/.test(v)) return 'doing';
  return 'todo';
}

const pick = (header: string[], names: RegExp) => header.findIndex((h) => names.test(h));

/**
 * Tasks from a CSV export (any service: the columns are found by name), a Markdown checklist,
 * or a plain list — one task a line. At most 500.
 */
export function parseTaskImport(text: string, fileName = ''): TransferTask[] {
  const out: TransferTask[] = [];
  const add = (task: TransferTask) => {
    const title = task.title.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (title && out.length < 500)
      out.push({ ...task, title, description: task.description.trim().slice(0, 2000) });
  };
  const looksCsv = /\.csv$/i.test(fileName) || (!fileName && /^[^\n]*,[^\n]*\n/.test(text));
  if (looksCsv) {
    const rows = parseCsv(text);
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const title = pick(header, /^(title|name|task|task name|content|summary|card name)$/);
    if (title >= 0) {
      const desc = pick(header, /^(description|notes?|details|card description)$/);
      const due = pick(header, /^(due|due date|date|deadline|due_date)$/);
      const priority = pick(header, /^(priority)$/);
      const status = pick(header, /^(status|state|done|completed|section\/column|list)$/);
      for (const row of rows.slice(1)) {
        add({
          title: row[title] ?? '',
          description: desc >= 0 ? (row[desc] ?? '') : '',
          dueDate: due >= 0 ? readDate(row[due] ?? '') : null,
          priority: priority >= 0 ? readPriority(row[priority] ?? '') : 'medium',
          status: status >= 0 ? readStatus(row[status] ?? '') : 'todo',
        });
      }
      return out;
    }
  }
  let last: TransferTask | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(raw);
    // An indented line under a task is its description.
    if (!item && last && /^\s{2,}\S/.test(raw)) {
      last.description += `${last.description ? '\n' : ''}${raw.trim()}`;
      continue;
    }
    let title = item ? item[2]! : raw.trim();
    let dueDate: string | null = null;
    let priority: TransferTask['priority'] = 'medium';
    const extras = /\s*\(([^)]*)\)\s*$/.exec(title);
    if (extras) {
      const due = /due (\d{4}-\d{2}-\d{2})/.exec(extras[1]!);
      if (due || /\bhigh\b/.test(extras[1]!)) {
        dueDate = due ? due[1]! : null;
        priority = /\bhigh\b/.test(extras[1]!) ? 'high' : 'medium';
        title = title.slice(0, extras.index);
      }
    }
    const task: TransferTask = {
      title,
      description: '',
      status: item?.[1] && item[1].toLowerCase() === 'x' ? 'done' : 'todo',
      priority,
      dueDate,
    };
    add(task);
    last = out.at(-1) ?? null;
  }
  return out;
}

/** The services Orbit recognises in links (roadmap P4.3): a name, and what it's for. */
export type KnownService = { name: string; kind: 'design' | 'docs' | 'files' | 'tasks' | 'code' };

/** The domain itself or a subdomain of it (not just any name ending the same way). */
const site = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

const SERVICES: { test: (host: string, path: string) => boolean; service: KnownService }[] = [
  { test: (h) => site(h, 'figma.com'), service: { name: 'Figma', kind: 'design' } },
  { test: (h) => site(h, 'canva.com'), service: { name: 'Canva', kind: 'design' } },
  { test: (h) => site(h, 'miro.com'), service: { name: 'Miro', kind: 'design' } },
  {
    test: (h, p) => h === 'docs.google.com' && p.startsWith('/spreadsheets'),
    service: { name: 'Google Sheets', kind: 'docs' },
  },
  {
    test: (h, p) => h === 'docs.google.com' && p.startsWith('/presentation'),
    service: { name: 'Google Slides', kind: 'docs' },
  },
  { test: (h) => h === 'docs.google.com', service: { name: 'Google Docs', kind: 'docs' } },
  { test: (h) => h === 'drive.google.com', service: { name: 'Google Drive', kind: 'files' } },
  { test: (h) => site(h, 'dropbox.com'), service: { name: 'Dropbox', kind: 'files' } },
  { test: (h) => site(h, 'box.com'), service: { name: 'Box', kind: 'files' } },
  {
    test: (h) => site(h, 'onedrive.live.com') || site(h, 'sharepoint.com'),
    service: { name: 'OneDrive', kind: 'files' },
  },
  {
    test: (h) => site(h, 'notion.so') || site(h, 'notion.site'),
    service: { name: 'Notion', kind: 'docs' },
  },
  { test: (h) => site(h, 'linear.app'), service: { name: 'Linear', kind: 'tasks' } },
  {
    test: (h, p) => site(h, 'atlassian.net') && p.startsWith('/wiki'),
    service: { name: 'Confluence', kind: 'docs' },
  },
  { test: (h) => site(h, 'atlassian.net'), service: { name: 'Jira', kind: 'tasks' } },
  { test: (h) => site(h, 'trello.com'), service: { name: 'Trello', kind: 'tasks' } },
  { test: (h) => site(h, 'asana.com'), service: { name: 'Asana', kind: 'tasks' } },
  { test: (h) => site(h, 'clickup.com'), service: { name: 'ClickUp', kind: 'tasks' } },
  { test: (h) => site(h, 'airtable.com'), service: { name: 'Airtable', kind: 'docs' } },
  { test: (h) => h === 'github.com', service: { name: 'GitHub', kind: 'code' } },
  { test: (h) => site(h, 'gitlab.com'), service: { name: 'GitLab', kind: 'code' } },
];

export function knownService(url: string): KnownService | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return SERVICES.find((s) => s.test(host, parsed.pathname))?.service ?? null;
}
