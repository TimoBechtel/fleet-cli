import { spawn } from 'node:child_process';
import path from 'node:path';

type RunOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
};

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const REPO_ROOT = path.resolve(import.meta.dir, '../..');
const CLI_ENTRY = path.join(REPO_ROOT, 'src/cli.ts');
const BUN_BIN = Bun.which('bun') ?? 'bun';
const REAL_HOME = process.env.HOME;
const FLEET_ENV: NodeJS.ProcessEnv = {
  GIT_AUTHOR_NAME: 'Fleet Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Fleet Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'commit.gpgsign',
  GIT_CONFIG_VALUE_0: 'false',
  // Disable hooks in tests (husky/lint-staged/global hooks can make tests flaky/slow).
  GIT_CONFIG_KEY_1: 'core.hooksPath',
  GIT_CONFIG_VALUE_1: '/dev/null',
  ...(REAL_HOME
    ? { BUN_INSTALL_CACHE_DIR: `${REAL_HOME}/.bun/install/cache` }
    : {}),
};

function runCommand(
  command: string,
  args: string[],
  options: RunOptions,
): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...FLEET_ENV,
      ...options.env,
    };
    // Git hooks run with repo-scoped env vars set; strip them to keep tests isolated.
    delete env.GIT_DIR;
    delete env.GIT_WORK_TREE;
    delete env.GIT_INDEX_FILE;
    delete env.GIT_COMMON_DIR;
    delete env.GIT_OBJECT_DIRECTORY;
    delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
    delete env.GIT_CEILING_DIRECTORIES;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += String(data);
    });
    child.stderr.on('data', (data) => {
      stderr += String(data);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

export async function runFleet(
  args: string[],
  options: RunOptions,
): Promise<RunResult> {
  return runCommand(BUN_BIN, ['run', CLI_ENTRY, ...args], options);
}

export async function runGit(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return runCommand('git', args, { cwd: options.cwd, env: options.env });
}

export async function initGitRepo(cwd: string) {
  await runGit(['init', '-b', 'main'], { cwd });
}

export async function commitAll(cwd: string, message: string) {
  await runGit(['add', '--all'], { cwd });
  await runGit(['commit', '-m', message], { cwd });
}
