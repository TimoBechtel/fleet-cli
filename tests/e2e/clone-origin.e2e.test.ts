import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitAll, initGitRepo, runFleet, runGit } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('clone backend preserves root origin remote url', async () => {
  await using dir = await TempDir.create();

  await initGitRepo(dir.path);
  await writeFile(path.join(dir.path, 'readme.md'), 'hello\n', 'utf8');
  await commitAll(dir.path, 'init');

  const init = await runFleet(['init', '.'], { cwd: dir.path });
  expect(init.exitCode).toBe(0);

  const originUrl = 'https://example.com/repo.git';
  await runGit(['remote', 'add', 'origin', originUrl], { cwd: dir.path });

  const add = await runFleet(['add', 'ws', '--backend', 'clone'], {
    cwd: dir.path,
  });
  expect(add.exitCode).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/ws');
  const origin = await runGit(['remote', 'get-url', 'origin'], {
    cwd: workspaceDir,
  });
  expect(origin.stdout.trim()).toBe(originUrl);
});
