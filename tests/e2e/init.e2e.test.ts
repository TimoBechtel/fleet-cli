import { expect, test } from 'bun:test';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitAll, initGitRepo, runFleet } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('init creates fleet project in empty directory', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  await access(path.join(dir.path, '.fleet/config.json'));
  await access(path.join(dir.path, '.fleet/workspaces'));
  await access(path.join(dir.path, '.git'));
});

test('init rejects dirty git repository', async () => {
  await using dir = await TempDir.create();

  await initGitRepo(dir.path);
  await writeFile(path.join(dir.path, 'a.txt'), 'a\n', 'utf8');
  await commitAll(dir.path, 'init');
  await writeFile(path.join(dir.path, 'a.txt'), 'b\n', 'utf8');

  const result = await runFleet(['init', '.'], { cwd: dir.path });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('uncommitted changes');
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

test('init rejects when already in fleet project', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);

  const second = await runFleet(['init', '.'], { cwd: dir.path });

  expect(second.exitCode).toBe(1);
  expect(second.stderr).toContain('already a Fleet project');
});
