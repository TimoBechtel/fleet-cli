import { expect, test } from 'bun:test';
import { access, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  commitAll,
  runFleet,
  runGit,
} from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('create makes workspace and list shows it', async () => {
  await using dir = await TempDir.create();

  const init = await runFleet(['init', '.'], { cwd: dir.path });
  expect(init.exitCode).toBe(0);

  const create = await runFleet(['new', 'task-one'], { cwd: dir.path });
  expect(create.exitCode).toBe(0);

  await access(
    path.join(dir.path, '.fleet/workspaces/task-one/.fleet/.workspace'),
  );

  const list = await runFleet(['list'], { cwd: dir.path });
  expect(list.exitCode).toBe(0);
  expect(list.stdout).toContain('task-one');
});

test('switch writes state file when shell integration env is enabled', async () => {
  await using dir = await TempDir.create();
  await using home = await TempDir.create('fleet-cli-home-');

  const init = await runFleet(['init', '.'], {
    cwd: dir.path,
    env: { HOME: home.path },
  });
  expect(init.exitCode).toBe(0);

  const create = await runFleet(['new', 'task-two'], {
    cwd: dir.path,
    env: { HOME: home.path },
  });
  expect(create.exitCode).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/task-two');
  const stateFile = path.join(home.path, '.config/fleet/fleet-shell-cd.tmp');

  const switched = await runFleet(['switch', 'task-two'], {
    cwd: dir.path,
    env: { HOME: home.path, FLEET_SHELL_INTEGRATION: 'true' },
  });

  expect(switched.exitCode).toBe(0);
  await access(stateFile);
  expect((await readFile(stateFile, 'utf8')).trim()).toBe(
    await realpath(workspaceDir),
  );
});

test("'switch --root' and '-' both switch to project root", async () => {
  await using dir = await TempDir.create();
  await using home = await TempDir.create('fleet-cli-home-');

  expect(
    (
      await runFleet(['init', '.'], {
        cwd: dir.path,
        env: { HOME: home.path },
      })
    ).exitCode,
  ).toBe(0);

  expect(
    (
      await runFleet(['new', 'task-root'], {
        cwd: dir.path,
        env: { HOME: home.path },
      })
    ).exitCode,
  ).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/task-root');
  const stateFile = path.join(home.path, '.config/fleet/fleet-shell-cd.tmp');

  const commands = [['switch', '--root'], ['-']];

  for (const command of commands) {
    const result = await runFleet(command, {
      cwd: workspaceDir,
      env: { HOME: home.path, FLEET_SHELL_INTEGRATION: 'true' },
    });

    expect(result.exitCode).toBe(0);
    await access(stateFile);
    expect((await readFile(stateFile, 'utf8')).trim()).toBe(
      await realpath(dir.path),
    );
    await rm(stateFile);
  }
});

test('switch with -c creates missing workspace', async () => {
  await using dir = await TempDir.create();
  await using home = await TempDir.create('fleet-cli-home-');

  expect(
    (
      await runFleet(['init', '.'], {
        cwd: dir.path,
        env: { HOME: home.path },
      })
    ).exitCode,
  ).toBe(0);

  const result = await runFleet(['switch', 'new-task', '--create'], {
    cwd: dir.path,
    env: { HOME: home.path, FLEET_SHELL_INTEGRATION: 'true' },
  });

  expect(result.exitCode).toBe(0);
  await access(
    path.join(dir.path, '.fleet/workspaces/new-task/.fleet/.workspace'),
  );
});

test('switch fails for missing workspace without -c', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);

  const result = await runFleet(['switch', 'missing-workspace'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('does not exist');
});

test('create fails when extraFiles include tracked dirty files', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  await writeFile(
    path.join(dir.path, '.fleet/config.json'),
    JSON.stringify({ extraFiles: ['tracked-extra.txt'] }, null, 2),
    'utf8',
  );
  await writeFile(path.join(dir.path, 'tracked-extra.txt'), 'v1\n', 'utf8');
  await commitAll(dir.path, 'add tracked extra file');
  await writeFile(path.join(dir.path, 'tracked-extra.txt'), 'v2\n', 'utf8');

  const result = await runFleet(['new', 'blocked'], { cwd: dir.path });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('extraFiles');
  expect(result.stderr).toContain('tracked-extra.txt');
  expect(result.stderr).toContain('Commit or stash');
});

test('create allows untracked extraFiles matches', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  await writeFile(
    path.join(dir.path, '.fleet/config.json'),
    JSON.stringify({ extraFiles: ['untracked-extra.txt'] }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(dir.path, 'untracked-extra.txt'),
    'local\n',
    'utf8',
  );

  const result = await runFleet(['new', 'with-untracked-env'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(0);
  await access(
    path.join(
      dir.path,
      '.fleet/workspaces/with-untracked-env/.fleet/.workspace',
    ),
  );
});

test('create with --base clones from specified branch instead of current', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  await writeFile(path.join(dir.path, 'file-on-main.txt'), 'main\n', 'utf8');
  await commitAll(dir.path, 'add file on main');

  await runGit(['checkout', '-b', 'feature-branch'], { cwd: dir.path });
  await writeFile(
    path.join(dir.path, 'file-on-feature.txt'),
    'feature\n',
    'utf8',
  );
  await commitAll(dir.path, 'add file on feature');

  const result = await runFleet(['new', 'from-main', '--base', 'main'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(0);

  const workspaceDir = path.join(dir.path, '.fleet/workspaces/from-main');
  await access(path.join(workspaceDir, '.fleet/.workspace'));

  const log = await runGit(['log', '--format=%s'], { cwd: workspaceDir });
  const commits = log.stdout.trim().split('\n');
  expect(commits).toContain('add file on main');
  expect(commits).not.toContain('add file on feature');

  await access(path.join(workspaceDir, 'file-on-main.txt'));
  try {
    await access(path.join(workspaceDir, 'file-on-feature.txt'));
    throw new Error(
      'file-on-feature.txt should not exist in workspace created from main',
    );
  } catch (error: unknown) {
    expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
  }
});
