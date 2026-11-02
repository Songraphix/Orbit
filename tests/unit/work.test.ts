import { afterEach, describe, expect, it } from 'vitest';
import {
  continueWith,
  dateKey,
  dueLabel,
  filterProjects,
  filterTasks,
  projectCounts,
  projectProblem,
  projectProgress,
  taskCounts,
  taskProblem,
  todayTasks,
} from '@shared/work';
import type { Project, Task } from '@shared/work';
import { openDatabase } from '../../src/main/persistence/db';
import type { Database } from '../../src/main/persistence/db';
import { migrate } from '../../src/main/persistence/migrate';
import { migrations } from '../../src/main/persistence/migrations';
import { WorkRepository } from '../../src/main/persistence/repositories/work';

const task = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  projectId: 'p',
  title: 't',
  description: '',
  priority: 'medium',
  status: 'todo',
  dueDate: null,
  completedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const project = (id: string, status: Project['status']): Project => ({
  id,
  name: id,
  description: '',
  status,
  color: 'purple',
  startDate: null,
  dueDate: null,
  spaceId: null,
  lastOpenedAt: null,
  githubRepo: null,
  createdAt: 0,
  updatedAt: 0,
});

describe('work model', () => {
  it('counts progress from tasks only, rounded, 0 % with none', () => {
    const tasks = [
      task({ status: 'done' }),
      task({ status: 'done' }),
      task({ status: 'doing' }),
      task({ projectId: 'other', status: 'done' }),
    ];
    expect(projectProgress('p', tasks)).toEqual({ total: 3, done: 2, remaining: 1, percent: 67 });
    expect(projectProgress('empty', tasks)).toEqual({
      total: 0,
      done: 0,
      remaining: 0,
      percent: 0,
    });
  });

  it('counts and filters projects by status', () => {
    const projects = [project('a', 'active'), project('b', 'active'), project('c', 'done')];
    expect(projectCounts(projects)).toEqual({ all: 3, active: 2, 'on-hold': 0, done: 1 });
    expect(filterProjects(projects, 'done').map((p) => p.id)).toEqual(['c']);
    expect(filterProjects(projects, 'all')).toHaveLength(3);
  });

  it('filters tasks by local date: today (with overdue), upcoming, completed, all', () => {
    const today = '2026-11-01';
    const tasks = [
      task({ id: 'late', dueDate: '2026-10-30' }),
      task({ id: 'now', dueDate: today }),
      task({ id: 'soon', dueDate: '2026-11-03' }),
      task({ id: 'whenever' }),
      task({ id: 'done', status: 'done', dueDate: today, completedAt: 5 }),
    ];
    const ids = (f: Parameters<typeof filterTasks>[1]) =>
      filterTasks(tasks, f, today).map((t) => t.id);
    expect(ids('today')).toEqual(['late', 'now']);
    expect(ids('upcoming')).toEqual(['soon']);
    expect(ids('completed')).toEqual(['done']);
    expect(ids('all')).toEqual(['late', 'now', 'soon', 'whenever', 'done']);
    expect(taskCounts(tasks, today)).toEqual({ all: 5, today: 2, upcoming: 1, completed: 1 });
  });

  it('today’s list: open tasks due today or overdue, then the ones ticked off today', () => {
    const today = '2026-11-01';
    const noon = new Date(2026, 10, 1, 12).getTime();
    const tasks = [
      task({ id: 'now', dueDate: today }),
      task({ id: 'late', dueDate: '2026-10-30' }),
      task({ id: 'soon', dueDate: '2026-11-03' }),
      task({ id: 'whenever' }),
      task({ id: 'doneToday', status: 'done', dueDate: today, completedAt: noon }),
      task({ id: 'doneBefore', status: 'done', dueDate: '2026-10-29', completedAt: 5 }),
    ];
    expect(todayTasks(tasks, today).map((t) => t.id)).toEqual(['late', 'now', 'doneToday']);
  });

  it('continues with the open project looked at last, and its next task', () => {
    const projects = [
      { ...project('old', 'active'), lastOpenedAt: 1 },
      { ...project('recent', 'active'), lastOpenedAt: 5 },
      { ...project('finished', 'done'), lastOpenedAt: 9 },
      project('never', 'active'),
    ];
    const tasks = [
      task({ projectId: 'recent', id: 'later', dueDate: '2026-11-09' }),
      task({ projectId: 'recent', id: 'soon', dueDate: '2026-11-02' }),
      task({ projectId: 'recent', id: 'done', status: 'done', dueDate: '2026-11-01' }),
    ];
    const next = continueWith(projects, tasks);
    expect(next?.project.id).toBe('recent');
    expect(next?.next?.id).toBe('soon');
    expect(continueWith([project('x', 'active')], [])).toBeNull();
  });

  it('labels due dates and validates input', () => {
    expect(dueLabel('2026-11-01', '2026-11-01')).toEqual({ text: 'Today', overdue: false });
    expect(dueLabel('2026-11-02', '2026-11-01')).toEqual({ text: 'Tomorrow', overdue: false });
    expect(dueLabel('2026-10-30', '2026-11-01').overdue).toBe(true);
    expect(dueLabel('2026-10-30', '2026-11-01', true).overdue).toBe(false);
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(projectProblem({ name: ' ', startDate: null, dueDate: null })).toMatch(/name/);
    expect(projectProblem({ name: 'X', startDate: '2026-11-05', dueDate: '2026-11-01' })).toMatch(
      /before/,
    );
    expect(taskProblem({ title: '' })).toMatch(/title/);
  });
});

describe('WorkRepository', () => {
  let db: Database | undefined;
  afterEach(() => {
    if (db?.isOpen) db.close();
  });
  const repo = () => {
    db = openDatabase(':memory:');
    migrate(db, migrations);
    return new WorkRepository(db);
  };
  const base = {
    description: '',
    color: 'blue' as const,
    startDate: null,
    dueDate: null,
    spaceId: null,
  };

  it('creates, edits and re-statuses projects; tasks follow them', () => {
    const r = repo();
    const id = r.saveProject({ ...base, name: ' Site ', status: 'active' });
    r.saveProject({ ...base, id, name: 'Website', status: 'active', description: 'New' });
    r.setProjectStatus(id, 'on-hold');
    expect(r.project(id)).toMatchObject({ name: 'Website', description: 'New', status: 'on-hold' });
    expect(() => r.saveProject({ ...base, name: '', status: 'active' })).toThrow(/name/);

    const t = r.saveTask({
      projectId: id,
      title: 'Hero',
      description: '',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-11-02',
    });
    r.setTaskStatus(t, 'done', 50);
    expect(r.task(t)).toMatchObject({ status: 'done', completedAt: 50, projectId: id });
    r.setTaskStatus(t, 'todo');
    expect(r.task(t)?.completedAt).toBeNull();
    expect(() =>
      r.saveTask({
        projectId: 'gone',
        title: 'x',
        description: '',
        priority: 'low',
        status: 'todo',
        dueDate: null,
      }),
    ).toThrow(/no longer exists/);
  });

  it('deletes a project with its tasks, or keeps them without a project', () => {
    const r = repo();
    const a = r.saveProject({ ...base, name: 'A', status: 'active' });
    const b = r.saveProject({ ...base, name: 'B', status: 'active' });
    const input = {
      title: 'T',
      description: '',
      priority: 'low' as const,
      status: 'todo' as const,
      dueDate: null,
    };
    const ta = r.saveTask({ ...input, projectId: a });
    const tb = r.saveTask({ ...input, projectId: b });
    r.deleteProject(a, false);
    expect(r.task(ta)).toBeNull();
    r.deleteProject(b, true);
    expect(r.task(tb)?.projectId).toBeNull();
    expect(r.all().projects).toEqual([]);
  });

  it("remembers a project's workspace and when it was opened", () => {
    const r = repo();
    const id = r.saveProject({ ...base, name: 'A', status: 'active', spaceId: 'space-1' });
    expect(r.project(id)).toMatchObject({ spaceId: 'space-1', lastOpenedAt: null });
    r.markOpened(id, 42);
    expect(r.project(id)?.lastOpenedAt).toBe(42);
  });

  it('offers the sample projects once, only into an empty list', () => {
    const r = repo();
    expect(r.seedSamples(Date.now())).toBe(true);
    const { projects, tasks } = r.all();
    expect(projects.map((p) => p.name)).toEqual([
      'SIRATEQ Brand Guide',
      'KraitiveSon Content',
      'Wise Roots Academy',
      'Son Studio Website',
    ]);
    expect(projectProgress(projects[0]!.id, tasks).percent).toBe(80);
    expect(projectProgress(projects[3]!.id, tasks).percent).toBe(100);
    for (const p of projects) r.deleteProject(p.id, false);
    expect(r.seedSamples()).toBe(false);
    expect(r.all().projects).toEqual([]);

    const other = repo();
    other.saveProject({ ...base, name: 'Mine', status: 'active' });
    expect(other.seedSamples()).toBe(false);
    expect(other.all().projects.map((p) => p.name)).toEqual(['Mine']);
  });
});
