import { expect, test } from 'bun:test';
import { runFleet } from '../helpers/cli';
import { TempDir } from '../helpers/temp-dir';

test('completion outputs scripts for supported shells', async () => {
  await using dir = await TempDir.create();

  const bashResult = await runFleet(['completion', '--shell', 'bash'], {
    cwd: dir.path,
  });

  expect(bashResult.exitCode).toBe(0);
  expect(bashResult.stdout).toContain('_fleet_complete');
  expect(bashResult.stdout).toContain(
    'complete -o default -o bashdefault -F _fleet_complete fleet',
  );
  expect(bashResult.stdout).toContain('fleet __complete commands');
  expect(bashResult.stdout).toContain('fleet __complete options');
  expect(bashResult.stdout).toContain('fleet __complete workspaces');

  const zshResult = await runFleet(['completion', '--shell', 'zsh'], {
    cwd: dir.path,
  });

  expect(zshResult.exitCode).toBe(0);
  expect(zshResult.stdout).toContain('compdef _fleet fleet');
  expect(zshResult.stdout).toContain('_describe');

  const fishResult = await runFleet(['completion', '--shell', 'fish'], {
    cwd: dir.path,
  });

  expect(fishResult.exitCode).toBe(0);
  expect(fishResult.stdout).toContain('function __fleet_complete_commands');
  expect(fishResult.stdout).toContain('fleet __complete commands --with-descriptions');
  expect(fishResult.stdout).toContain('fleet __complete options');
  expect(fishResult.stdout).toContain('fleet __complete workspaces');
});

test('__complete workspaces lists workspace names', async () => {
  await using dir = await TempDir.create();

  expect((await runFleet(['init', '.'], { cwd: dir.path })).exitCode).toBe(0);
  expect((await runFleet(['new', 'alpha'], { cwd: dir.path })).exitCode).toBe(0);
  expect((await runFleet(['new', 'bravo'], { cwd: dir.path })).exitCode).toBe(0);

  const result = await runFleet(['__complete', 'workspaces'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('alpha');
  expect(result.stdout).toContain('bravo');
});

test('__complete commands lists visible command names and aliases', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(['__complete', 'commands'], { cwd: dir.path });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('init');
  expect(result.stdout).toContain('exec');
  expect(result.stdout).toContain('x');
  expect(result.stdout).toContain('switch');
  expect(result.stdout).toContain('sw');
  expect(result.stdout).toContain('list');
  expect(result.stdout).toContain('ls');
  expect(result.stdout).toContain('completion');
  expect(result.stdout).not.toContain('__complete');
  expect(result.stdout).not.toContain('\n-\n');
});

test('__complete commands supports descriptions', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(
    ['__complete', 'commands', '--with-descriptions'],
    { cwd: dir.path },
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('init\t');
});

test('__complete options lists option tokens with descriptions', async () => {
  await using dir = await TempDir.create();

  const result = await runFleet(
    ['__complete', 'options', 'switch', '--with-descriptions'],
    { cwd: dir.path },
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('--root\t');
  expect(result.stdout).toContain('-r\t');
  expect(result.stdout).not.toContain('--help');
});
