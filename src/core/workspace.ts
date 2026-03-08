import { copy, ensureDir, pathExists } from 'fs-extra';
import { execSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Backend } from './backends/backend.js';
import type { FleetConfig } from './config.js';

type RootContext = { kind: 'root' };
type BackendContext = {
  projectRootDir: string;
  name: string;
  backend: Backend;
};
type ExistingContext = BackendContext & {
  kind: 'existing';
};
type CreateContext = BackendContext & {
  kind: 'create';
  config: FleetConfig;
};
type WorkspaceContext = RootContext | ExistingContext | CreateContext;

// Workspace helper for git operations and backend actions on a directory.
export class Workspace<Context extends WorkspaceContext = WorkspaceContext> {
  private static readonly FALLBACK_DEFAULT_GIT_BRANCH = 'main';

  private gitClient?: SimpleGit;

  private constructor(
    private readonly workingDir: string,
    private readonly context: Context,
  ) {}

  // Use factories so required context is always present for each use case.
  static forRoot(dir: string): Workspace<RootContext> {
    return new Workspace<RootContext>(dir, { kind: 'root' });
  }

  static forExisting(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    backend: Backend;
  }): Workspace<ExistingContext> {
    return new Workspace<ExistingContext>(args.workspaceDir, {
      kind: 'existing',
      projectRootDir: args.projectRootDir,
      name: args.name,
      backend: args.backend,
    });
  }

  static forCreate(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    backend: Backend;
    config: FleetConfig;
  }): Workspace<CreateContext> {
    return new Workspace<CreateContext>(args.workspaceDir, {
      kind: 'create',
      projectRootDir: args.projectRootDir,
      name: args.name,
      backend: args.backend,
      config: args.config,
    });
  }

  static async isGitRoot(dir: string): Promise<boolean> {
    try {
      const gitDir = path.join(dir, '.git');
      return await pathExists(gitDir);
    } catch {
      return false;
    }
  }

  async create(
    this: Workspace<CreateContext>,
    baseBranch?: string,
  ): Promise<void> {
    const { projectRootDir, name, backend, config } = this.context;
    await backend.createWorkspace({
      projectRootDir,
      workspaceDir: this.workingDir,
      name,
      config,
      baseBranch,
    });
    await this.runPostInitSteps(this.workingDir, config);
    await this.ensureWorkspaceMarker();
  }

  async mergeIntoRoot(
    this: Workspace<ExistingContext> | Workspace<CreateContext>,
  ): Promise<void> {
    const { projectRootDir, name, backend } = this.context;
    await backend.mergeWorkspace({
      projectRootDir,
      workspaceDir: this.workingDir,
      name,
    });
  }

  async removeFromRoot(
    this: Workspace<ExistingContext> | Workspace<CreateContext>,
    options?: { force?: boolean },
  ): Promise<void> {
    const { projectRootDir, name, backend } = this.context;
    await backend.removeWorkspace({
      projectRootDir,
      workspaceDir: this.workingDir,
      name,
      force: options?.force,
    });
  }

  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git().status();
      return status.files.length > 0;
    } catch {
      return false;
    }
  }

  async getTrackedDirtyFiles(): Promise<string[]> {
    try {
      const [unstaged, staged] = await Promise.all([
        this.git().diff(['--name-only']),
        this.git().diff(['--cached', '--name-only']),
      ]);
      const trackedDirtyFiles = new Set<string>();
      for (const line of [...unstaged.split('\n'), ...staged.split('\n')]) {
        const filePath = line.trim();
        if (filePath) trackedDirtyFiles.add(filePath);
      }
      return [...trackedDirtyFiles];
    } catch {
      return [];
    }
  }

  async hasTrackedDirtyExtraFiles(patterns: string[]): Promise<string[]> {
    if (patterns.length === 0) return [];
    const trackedDirtyFiles = new Set(await this.getTrackedDirtyFiles());
    if (trackedDirtyFiles.size === 0) return [];
    const { glob } = await import('glob');
    const matchedTrackedDirtyExtraFiles = new Set<string>();
    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { cwd: this.workingDir });
        for (const file of files) {
          if (trackedDirtyFiles.has(file)) {
            matchedTrackedDirtyExtraFiles.add(file);
          }
        }
      } catch {
        continue;
      }
    }
    return [...matchedTrackedDirtyExtraFiles];
  }

  async getMainBranch(): Promise<string> {
    try {
      const result = await this.git().raw([
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
      ]);
      return result.trim().replace('refs/remotes/origin/', '');
    } catch {
      try {
        const current = await this.git().branch();
        return current.current || Workspace.FALLBACK_DEFAULT_GIT_BRANCH;
      } catch {
        return Workspace.FALLBACK_DEFAULT_GIT_BRANCH;
      }
    }
  }

  async isDiverged(projectRootDir: string): Promise<boolean> {
    try {
      const currentHead = (await this.git().revparse(['HEAD'])).trim();
      const projectRootWorkspace = Workspace.forRoot(projectRootDir);
      const projectRootHead = (await projectRootWorkspace
        .git()
        .revparse(['HEAD'])).trim();

      if (currentHead === projectRootHead) {
        return false;
      }

      const revList = await projectRootWorkspace.git().raw([
        'rev-list',
        '--left-right',
        '--count',
        `${projectRootHead}...${currentHead}`,
      ]);
      const [, rightCountRaw] = revList.trim().split(/\s+/);
      const rightCount = Number(rightCountRaw ?? 0);
      return rightCount > 0;
    } catch {
      return true;
    }
  }

  async getCurrentBranch(): Promise<string | null> {
    return (await this.git().branch()).current || null;
  }

  async commitChanges(message: string): Promise<void> {
    await this.git().add('--all');
    await this.git().commit(message);
  }

  async initRepository(): Promise<void> {
    await this.git().init();
    await this.git().add('--all');
    await this.git().raw(['commit', '--allow-empty', '-m', 'Initial commit']);
  }

  private git(): SimpleGit {
    if (!this.gitClient) {
      this.gitClient = simpleGit(this.workingDir);
    }
    return this.gitClient;
  }

  // Write the workspace marker so Fleet can identify this directory.
  private async ensureWorkspaceMarker(
    this: Workspace<CreateContext>,
  ): Promise<void> {
    const { projectRootDir } = this.context;
    await ensureDir(path.join(this.workingDir, '.fleet'));
    await writeFile(path.join(this.workingDir, '.fleet', '.workspace'), '');
    const rootGitignore = path.join(projectRootDir, '.fleet', '.gitignore');
    const workspaceGitignore = path.join(
      this.workingDir,
      '.fleet',
      '.gitignore',
    );
    if (
      (await pathExists(rootGitignore)) &&
      !(await pathExists(workspaceGitignore))
    ) {
      await copyFile(rootGitignore, workspaceGitignore);
    }
  }

  private async runPostInitSteps(
    this: Workspace<CreateContext>,
    targetDir: string,
    config: FleetConfig,
  ): Promise<void> {
    if (config.extraFiles.length) {
      const sourceDir = this.context.projectRootDir;
      await this.copyExtraFiles(sourceDir, targetDir, config.extraFiles);
    }

    if (config.postInitCommand) {
      await this.runPostInitCommand(targetDir, config.postInitCommand);
    }
  }

  private async copyExtraFiles(
    sourceDir: string,
    targetDir: string,
    patterns: string[],
  ): Promise<void> {
    const { glob } = await import('glob');

    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { cwd: sourceDir });
        for (const file of files) {
          const sourcePath = path.join(sourceDir, file);
          const targetPath = path.join(targetDir, file);
          await ensureDir(path.dirname(targetPath));
          await copy(sourcePath, targetPath);
        }
      } catch (error: unknown) {
        console.warn(
          `Failed to copy files matching ${pattern}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async runPostInitCommand(
    workspaceDir: string,
    command: string,
  ): Promise<void> {
    try {
      execSync(command, { cwd: workspaceDir, stdio: 'inherit' });
    } catch (error: unknown) {
      console.warn(
        `Post-init command failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export type RootWorkspace = Workspace<RootContext>;
export type ExistingWorkspace = Workspace<ExistingContext>;
export type CreateWorkspace = Workspace<CreateContext>;
