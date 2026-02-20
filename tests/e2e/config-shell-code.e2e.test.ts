import { expect, test } from 'bun:test';
import { ensureDir, writeJSON } from 'fs-extra';
import path from 'node:path';
import { runFleet } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('config show prefers project config values over global config values', async () => {
  await using dir = await TempDir.create();
  await using home = await TempDir.create('fleet-cli-home-');

  const globalConfigPath = path.join(home.path, '.config/fleet/config.json');
  await ensureDir(path.dirname(globalConfigPath));
  await writeJSON(globalConfigPath, {
    postInitCommand: 'echo global',
    extraFiles: ['global.env'],
  });

  expect(
    (
      await runFleet(['init', '.'], {
        cwd: dir.path,
        env: { HOME: home.path },
      })
    ).exitCode,
  ).toBe(0);
  await writeJSON(path.join(dir.path, '.fleet/config.json'), {
    postInitCommand: 'echo project',
    extraFiles: ['project.env'],
  });

  const result = await runFleet(['config', 'show'], {
    cwd: dir.path,
    env: { HOME: home.path },
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('"postInitCommand": "echo project"');
  expect(result.stdout).toContain('"extraFiles": [');
  expect(result.stdout).toContain('"project.env"');
});

test('shell-code returns function for supported shell', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['shell-code', '--shell', 'fish'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('function fleet');
  expect(result.stdout).toContain('FLEET_SHELL_INTEGRATION=true');
});

test('shell-code fails for unsupported shell', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['shell-code', '--shell', 'powershell'], {
    cwd: dir.path,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Unsupported shell');
});
