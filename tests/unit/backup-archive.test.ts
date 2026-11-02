import { describe, expect, it } from 'vitest';
import {
  BackupError,
  backupFileName,
  backupsBeyond,
  decryptBackup,
  encryptBackup,
  isEncrypted,
  packBackup,
  safePath,
  unpackBackup,
} from '../../src/main/backup/archive';
import { addDays, daysBetween, tasksAsTemplate } from '@shared/project-templates';
import { githubRepo, parseGithubList, taskFromGithub } from '@shared/github';

const files = [
  { path: 'orbit.db', data: Buffer.from('database bytes') },
  { path: 'Captures/shot.png', data: Buffer.from([1, 2, 3]) },
];

describe('backups', () => {
  it('packs and unpacks files with a manifest', () => {
    const archive = packBackup(files, '0.1.0', 1_000);
    const { manifest, files: out } = unpackBackup(archive);
    expect(manifest).toMatchObject({ version: 1, createdAt: 1_000, appVersion: '0.1.0' });
    expect(out.map((f) => [f.path, f.data.toString('hex')])).toEqual([
      ['orbit.db', Buffer.from('database bytes').toString('hex')],
      ['Captures/shot.png', '010203'],
    ]);
  });

  it('encrypts with a passphrase, and refuses a wrong one', () => {
    const archive = packBackup(files, '0.1.0');
    const locked = encryptBackup(archive, 'correct horse');
    expect(isEncrypted(locked)).toBe(true);
    expect(locked.includes(Buffer.from('database bytes'))).toBe(false);
    expect(decryptBackup(locked, 'correct horse').equals(archive)).toBe(true);
    expect(() => decryptBackup(locked, 'wrong')).toThrow(BackupError);
  });

  it('refuses unsafe paths and damaged archives', () => {
    expect(safePath('../etc/passwd')).toBe(false);
    expect(safePath('/abs')).toBe(false);
    expect(safePath('Captures/a.png')).toBe(true);
    expect(() => packBackup([{ path: '../x', data: Buffer.alloc(0) }], '1')).toThrow();
    expect(() => unpackBackup(Buffer.from('nope'))).toThrow('isn’t an Orbit backup');
    const archive = packBackup(files, '0.1.0');
    expect(() => unpackBackup(archive.subarray(0, archive.length - 2))).toThrow('incomplete');
  });

  it('names backups by date and keeps the newest', () => {
    const name = backupFileName(new Date(2026, 10, 2, 9, 5).getTime());
    expect(name).toBe('Orbit Backup 2026-11-02 09.05.orbitbackup');
    const names = [
      'Orbit Backup 2026-11-01 10.00.orbitbackup',
      'Orbit Backup 2026-11-02 10.00.orbitbackup',
      'Orbit Backup 2026-10-30 10.00.orbitbackup',
      'notes.txt',
    ];
    expect(backupsBeyond(names, 2)).toEqual(['Orbit Backup 2026-10-30 10.00.orbitbackup']);
  });
});

describe('project templates', () => {
  it('counts days and keeps due dates relative to the start', () => {
    expect(addDays('2026-11-30', 2)).toBe('2026-12-02');
    expect(daysBetween('2026-11-01', '2026-11-15')).toBe(14);
    expect(
      tasksAsTemplate(
        [
          { title: 'A', description: '', priority: 'high', dueDate: '2026-11-05' },
          { title: 'B', description: 'x', priority: 'low', dueDate: null },
        ],
        '2026-11-01',
      ),
    ).toEqual([
      { title: 'A', description: '', priority: 'high', dueIn: 4 },
      { title: 'B', description: 'x', priority: 'low', dueIn: null },
    ]);
  });
});

describe('GitHub', () => {
  it('reads repositories as people write them', () => {
    expect(githubRepo('acme/site')).toBe('acme/site');
    expect(githubRepo('https://github.com/acme/site/pulls')).toBe('acme/site');
    expect(githubRepo('github.com/acme/site.git')).toBe('acme/site');
    expect(githubRepo('acme')).toBeNull();
    expect(githubRepo('https://gitlab.com/acme/site')).toBeNull();
  });

  it('reads pull requests and issues (without the pulls in the issues list)', () => {
    const data = [
      {
        number: 3,
        title: 'Fix nav',
        html_url: 'https://github.com/acme/site/issues/3',
        user: { login: 'sam' },
        labels: [{ name: 'bug' }],
        updated_at: '2026-11-01T10:00:00Z',
        comments: 2,
      },
      {
        number: 4,
        title: 'A PR',
        html_url: 'https://github.com/acme/site/pull/4',
        pull_request: {},
      },
      { number: 5, title: 'Bad link', html_url: 'https://evil.example/5' },
    ];
    const issues = parseGithubList(data, 'issue');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ number: 3, author: 'sam', labels: ['bug'], comments: 2 });
    expect(parseGithubList(data, 'pull').map((i) => i.number)).toEqual([3, 4]);
    expect(taskFromGithub(issues[0]!, 'acme/site')).toEqual({
      title: '#3 Fix nav',
      description: 'acme/site issue #3\nhttps://github.com/acme/site/issues/3',
    });
  });
});
