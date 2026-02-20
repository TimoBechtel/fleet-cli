import { expect, test } from 'bun:test';
import path from 'node:path';
import { runFleet } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('exec runs command inside workspace directory', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'task-exec'], { cwd: dir.path })).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/task-exec');
  const result = await runFleet(['exec', 'task-exec', 'pwd'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(workspaceDir);
});

test('exec accepts explicit directory path', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);

  const result = await runFleet(['exec', dir.path, 'pwd'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(dir.path);
});

test('exec fails when workspace or directory does not exist', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);

  const result = await runFleet(['exec', 'does-not-exist', 'pwd'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('does not exist');
});

test('exec propagates child command exit code', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);

  const result = await runFleet(['exec', dir.path, 'exit', '7'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(7);
});
