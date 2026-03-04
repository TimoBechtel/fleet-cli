import { expect, test, mock } from 'bun:test';

let selectImpl: (...args: unknown[]) => Promise<unknown> = async () => 'task-one';

mock.module('@inquirer/prompts', () => ({
  select: (...args: unknown[]) => selectImpl(...args),
}));

mock.module('../../src/core/fleet.js', () => ({
  FleetProject: {
    ensureFleetProject: async () => ({
      root: '/tmp/fleet-root',
      getWorkspaces: async () => ['task-one'],
      buildWorkspacePath: (name: string) => `/tmp/${name}`,
      createWorkspace: async () => {},
    }),
  },
}));

mock.module('../../src/core/utils.js', () => ({
  getCurrentWorkspaceName: async () => null,
  resolveWorkspaceDirectory: async () => '/tmp/task-one',
}));

mock.module('../../src/core/shell-integration.js', () => ({
  ShellIntegration: {
    changeDirectory: async () => {},
  },
}));

const { switchCommand } = await import('../../src/commands/switch.ts');

test('switch prompt cancel exits 1 without error output', async () => {
  const cancelError = new Error('Cancelled');
  cancelError.name = 'ExitPromptError';
  selectImpl = async () => {
    throw cancelError;
  };

  const originalError = console.error;
  const originalExit = process.exit;
  const errors: string[] = [];
  let exitCode: number | undefined;

  console.error = (...args: unknown[]) => {
    errors.push(args.join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
  }) as typeof process.exit;

  try {
    await Promise.race([
      switchCommand(),
      new Promise((resolve) => setTimeout(resolve, 10)),
    ]);
  } finally {
    console.error = originalError;
    process.exit = originalExit;
  }

  expect(exitCode).toBe(1);
  expect(errors.join(' ')).not.toContain('Error:');
});

test('switch prompt error still prints error and exits 1', async () => {
  selectImpl = async () => {
    throw new Error('boom');
  };

  const originalError = console.error;
  const originalExit = process.exit;
  const errors: string[] = [];
  let exitCode: number | undefined;

  console.error = (...args: unknown[]) => {
    errors.push(args.join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error('process.exit');
  }) as typeof process.exit;

  try {
    await switchCommand();
  } catch {
    // swallow process.exit
  } finally {
    console.error = originalError;
    process.exit = originalExit;
  }

  expect(exitCode).toBe(1);
  expect(errors.join(' ')).toContain('Error:');
  expect(errors.join(' ')).toContain('boom');
});
