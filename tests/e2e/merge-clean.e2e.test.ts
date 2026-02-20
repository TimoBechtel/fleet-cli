import { expect, test } from 'bun:test';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitAll, runFleet } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('merge integrates workspace changes and removes workspace directory', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'feature-merge'], { cwd: dir.path })).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/feature-merge');
  await access(workspaceDir);

  await writeFile(
    path.join(workspaceDir, 'feature.txt'),
    'from-workspace\n',
    'utf8',
  );
  await commitAll(workspaceDir, 'feature commit');

  const merged = await runFleet(['merge', 'feature-merge'], {
    cwd: dir.path,
    input: 'y\n',
  });

  expect(merged.exitCode).toBe(0);
  expect(merged.stdout).toContain('merged');
  await access(path.join(dir.path, 'feature.txt'));
  expect(await Bun.file(workspaceDir).exists()).toBe(false);
});

test('merge fails when workspace has uncommitted changes', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'dirty-merge'], { cwd: dir.path })).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/dirty-merge');
  await writeFile(path.join(workspaceDir, 'dirty.txt'), 'dirty\n', 'utf8');

  const result = await runFleet(['merge', 'dirty-merge'], {
    cwd: dir.path,
    input: 'y\n',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('has uncommitted changes');
});

test('clean removes merged workspace and keeps diverged one', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'clean-me'], { cwd: dir.path })).exitCode,
  ).toBe(0);
  expect((await runFleet(['new', 'keep-me'], { cwd: dir.path })).exitCode).toBe(
    0,
  );

  const keepDir = path.join(dir.path, '.fleet/workspaces/keep-me');
  await writeFile(path.join(keepDir, 'keep.txt'), 'diverged\n', 'utf8');
  await commitAll(keepDir, 'diverge keep-me');

  const cleaned = await runFleet(['clean'], { cwd: dir.path, input: 'y\n' });

  expect(cleaned.exitCode).toBe(0);
  expect(
    await Bun.file(path.join(dir.path, '.fleet/workspaces/clean-me')).exists(),
  ).toBe(false);
  await access(path.join(dir.path, '.fleet/workspaces/keep-me'));
});

test('delete removes merge-clean workspace', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'delete-me'], { cwd: dir.path })).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/delete-me');
  await access(workspaceDir);

  const result = await runFleet(['rm', 'delete-me'], {
    cwd: dir.path,
    input: 'y\n',
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('deleted workspace');
  expect(await Bun.file(workspaceDir).exists()).toBe(false);
});

test('delete fails without --force when workspace has uncommitted changes', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'dirty-delete'], { cwd: dir.path })).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/dirty-delete');
  await writeFile(path.join(workspaceDir, 'dirty.txt'), 'dirty\n', 'utf8');

  const result = await runFleet(['rm', 'dirty-delete'], { cwd: dir.path });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('uncommitted changes');
  expect(result.stderr).toContain('--force');
  await access(workspaceDir);
});

test('delete fails without --force when workspace has diverged commits', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect(
    (await runFleet(['new', 'diverged-delete'], { cwd: dir.path })).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/diverged-delete');
  await writeFile(path.join(workspaceDir, 'div.txt'), 'diverged\n', 'utf8');
  await commitAll(workspaceDir, 'diverge');

  const result = await runFleet(['rm', 'diverged-delete'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('not merged');
  expect(result.stderr).toContain('--force');
  await access(workspaceDir);
});
