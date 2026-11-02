import { afterEach, describe, expect, it } from 'vitest';
import { runWorkTool, workTools } from '../../src/main/ai/work-tools';
import { apiMessages } from '../../src/main/ai/assistant-model';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { WorkRepository } from '../../src/main/persistence/repositories/work';

describe('Orbit AI work tools', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const setup = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    const work = new WorkRepository(db);
    const focused: unknown[] = [];
    const now = () => new Date(2026, 10, 2, 9).getTime(); // 2 Nov 2026, local
    const run = (name: string, input: unknown) =>
      runWorkTool(name, input, { work, startFocus: (i) => focused.push(i), now });
    return { work, run, focused };
  };

  it('describes each tool with a JSON Schema object, inputs streamed', () => {
    const tools = workTools();
    expect(tools.map((t) => (t as { name: string }).name)).toEqual([
      'list_projects',
      'list_tasks',
      'create_task',
      'update_task',
      'create_project',
      'update_project',
      'start_focus',
    ]);
    for (const tool of tools) {
      const t = tool as { input_schema: { type: string }; eager_input_streaming?: boolean };
      expect(t.input_schema.type).toBe('object');
      expect(t.eager_input_streaming).toBe(true);
      expect(JSON.stringify(t.input_schema)).not.toContain('$schema');
    }
  });

  it('plans a project, adds and reschedules tasks, ticks one off — and says what it did', () => {
    const { work, run } = setup();
    const made = run('create_project', {
      name: 'Launch',
      due_date: '2026-11-20',
      tasks: ['Write copy', 'Design hero'],
    });
    expect(made.action).toEqual({
      kind: 'create',
      label: 'Created project “Launch” with 2 tasks',
    });
    const projectId = (JSON.parse(made.content) as { created: { id: string } }).created.id;
    const added = run('create_task', {
      title: 'Book photographer',
      project_id: projectId,
      due_date: '2026-11-02',
      priority: 'high',
    });
    expect(added.action?.label).toBe('Added “Book photographer” to Launch');
    expect(added.changed).toBe(true);

    const today = JSON.parse(run('list_tasks', { filter: 'today' }).content) as {
      today: string;
      tasks: { id: string; title: string; project: string }[];
    };
    expect(today.today).toBe('2026-11-02');
    expect(today.tasks.map((t) => t.title)).toEqual(['Book photographer']);
    expect(today.tasks[0]!.project).toBe('Launch');

    const id = today.tasks[0]!.id;
    expect(run('update_task', { task_id: id, due_date: '2026-11-05' }).action?.label).toBe(
      'Updated “Book photographer”',
    );
    expect(work.task(id)?.dueDate).toBe('2026-11-05');
    expect(run('update_task', { task_id: id, status: 'done' }).action?.label).toBe(
      'Marked “Book photographer” done',
    );
    expect(work.task(id)?.status).toBe('done');
    expect(work.task(id)?.priority).toBe('high'); // untouched fields stay

    const projects = JSON.parse(run('list_projects', {}).content) as {
      projects: { name: string; tasks_done: number; tasks_total: number }[];
    };
    expect(projects.projects.find((p) => p.name === 'Launch')).toMatchObject({
      tasks_done: 1,
      tasks_total: 3,
    });
  });

  it('refuses bad input and unknown ids without changing anything', () => {
    const { work, run } = setup();
    const before = work.all().tasks.length;
    expect(run('create_task', { title: '' }).isError).toBe(true);
    expect(run('create_task', { title: 'x', due_date: 'next week' }).isError).toBe(true);
    expect(run('create_task', { title: 'x', project_id: 'nope' }).isError).toBe(true);
    expect(run('update_task', { task_id: 'nope', status: 'done' }).isError).toBe(true);
    expect(run('delete_task', { task_id: 'x' }).isError).toBe(true); // there is no delete
    expect(work.all().tasks.length).toBe(before);
  });

  it('starts focus on a task', () => {
    const { run, focused } = setup();
    const made = JSON.parse(run('create_task', { title: 'Deep work' }).content) as {
      created: { id: string };
    };
    expect(run('start_focus', { task_id: made.created.id, minutes: 50 }).action?.label).toBe(
      'Started focus on “Deep work”',
    );
    expect(focused).toEqual([{ taskId: made.created.id, minutes: 50 }]);
  });

  it('replays a finished answer’s tool rounds; an unfinished one leaves none', () => {
    const exchange = [
      {
        role: 'assistant' as const,
        content: [{ type: 'tool_use' as const, id: 't1', name: 'list_tasks', input: {} }],
      },
      {
        role: 'user' as const,
        content: [{ type: 'tool_result' as const, tool_use_id: 't1', content: '{}' }],
      },
    ];
    const done = apiMessages(
      [{ prompt: 'what’s on?', docs: [], answer: 'Two things.', exchange }],
      [],
    );
    expect(done.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const failed = apiMessages([{ prompt: 'what’s on?', docs: [], answer: '', exchange }], []);
    expect(failed.map((m) => m.role)).toEqual(['user']);
  });
});
