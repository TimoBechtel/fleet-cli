import { expect, test } from 'bun:test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitAll, initGitRepo, runFleet, runGit } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('init creates fleet project in empty directory', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  await access(path.join(dir.path, '.fleet/config.json'));
  await access(path.join(dir.path, '.fleet/workspaces'));
  await access(path.join(dir.path, '.git'));
});

test('init allows dirty git repository without auto-commit', async () => {
  await using dir = await TempDir.create();

  await initGitRepo(dir.path);
  await writeFile(path.join(dir.path, 'a.txt'), 'a\n', 'utf8');
  await commitAll(dir.path, 'init');
  await writeFile(path.join(dir.path, 'a.txt'), 'b\n', 'utf8');

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  const count = await runGit(['rev-list', '--count', 'HEAD'], {
    cwd: dir.path,
  });
  expect(count.stdout.trim()).toBe('1');
});

test('init rejects non-empty non-git directory', async () => {
  await using dir = await TempDir.create();

  await writeFile(path.join(dir.path, 'note.txt'), 'hello\n', 'utf8');

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(
    'not empty and not the root of a git repository',
  );
});

test('init succeeds in existing clean git repository', async () => {
  await using dir = await TempDir.create();

  await initGitRepo(dir.path);
  await writeFile(path.join(dir.path, 'a.txt'), 'a\n', 'utf8');
  await commitAll(dir.path, 'init');

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  await access(path.join(dir.path, '.fleet/config.json'));
});

test('init creates a commit for new project', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  const log = await runGit(['log', '-1', '--pretty=%s'], { cwd: dir.path });
  expect(log.stdout.trim()).toBe('Initialize Fleet');
});

test('init --stealth keeps git status clean and skips Initialize Fleet commit', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['init', '.', '--stealth'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  const status = await runGit(['status', '--porcelain'], { cwd: dir.path });
  expect(status.stdout.trim()).toBe('');

  const log = await runGit(['log', '--pretty=%s'], { cwd: dir.path });
  expect(log.stdout).not.toContain('Initialize Fleet');

  const gitignore = await readFile(
    path.join(dir.path, '.fleet/.gitignore'),
    'utf8',
  );
  expect(gitignore.split('\n').slice(0, 4)).toEqual([
    '# Fleet stealth mode: keep .fleet/ local. To track Fleet config in git, remove the next line.',
    '*',
    '/workspaces/',
    '.workspace',
  ]);
});

test('fleet add copies root .fleet/.gitignore into workspace in stealth projects', async () => {
  await using dir = await TempDir.create();

  const init = await runFleet(['init', '.', '--stealth'], { cwd: dir.path });
  expect(init.exitCode).toBe(0);

  const add = await runFleet(['add', 'alpha'], { cwd: dir.path });
  expect(add.exitCode).toBe(0);

  const rootGitignore = await readFile(
    path.join(dir.path, '.fleet/.gitignore'),
    'utf8',
  );
  const workspaceGitignore = await readFile(
    path.join(dir.path, '.fleet/workspaces/alpha/.fleet/.gitignore'),
    'utf8',
  );
  expect(workspaceGitignore).toBe(rootGitignore);

  const workspaceStatus = await runGit(['status', '--porcelain'], {
    cwd: path.join(dir.path, '.fleet/workspaces/alpha'),
  });
  expect(workspaceStatus.stdout.trim()).toBe('');
});

test('init rejects when .fleet already exists', async () => {
  await using dir = await TempDir.create();

  await mkdir(path.join(dir.path, '.fleet'), { recursive: true });
  await writeFile(path.join(dir.path, '.fleet/.workspace'), '', 'utf8');

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('contains a .fleet directory');
});

test('init rejects when already in fleet project', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);

  const second = await runFleet(['init', '.'], { cwd: dir.path });

  expect(second.exitCode).toBe(1);
  expect(second.stderr).toContain('already a Fleet project');
});
