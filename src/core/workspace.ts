import { copy, ensureDir, pathExists } from 'fs-extra';
import { execSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Backend } from './backends/backend.js';
import type { FleetConfig } from './config.js';

type WorkspaceBackendContext = {
  projectRootDir: string;
  name: string;
  backend: Backend;
  config?: FleetConfig;
};

/**
 * Workspace helper:
 * - wraps git operations for a directory
 * - delegates create/merge/remove lifecycle to a backend (clone/worktree)
 */
export class Workspace {
  private static readonly FALLBACK_DEFAULT_GIT_BRANCH = 'main';

  private gitClient?: SimpleGit;

  private constructor(
    private readonly workingDir: string,
    private readonly backendContext?: WorkspaceBackendContext,
  ) {}

  /** Root workspace (project root). No backend context. */
  static forRoot(dir: string): Workspace {
    return new Workspace(dir);
  }

  /** Existing workspace (for merge/rm/clean). Backend must already be detected. */
  static forExisting(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    backend: Backend;
  }): Workspace {
    return new Workspace(args.workspaceDir, {
      projectRootDir: args.projectRootDir,
      name: args.name,
      backend: args.backend,
    });
  }

  /** Workspace being created. Needs config for post-init steps. */
  static forCreate(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    backend: Backend;
    config: FleetConfig;
  }): Workspace {
    return new Workspace(args.workspaceDir, {
      projectRootDir: args.projectRootDir,
      name: args.name,
      backend: args.backend,
      config: args.config,
    });
  }

  static async isGitRoot(dir: string): Promise<boolean> {
    try {
      return await pathExists(path.join(dir, '.git'));
    } catch {
      return false;
    }
  }

  async create(baseBranch?: string): Promise<void> {
    const ctx = this.requireCreateContext();

    await ctx.backend.createWorkspace({
      projectRootDir: ctx.projectRootDir,
      workspaceDir: this.workingDir,
      name: ctx.name,
      config: ctx.config,
      baseBranch,
    });

    // Backend create may not include untracked Fleet metadata (.fleet/), so we always
    // run post-init + marker creation inside the newly created checkout.
    await this.runPostInitSteps(this.workingDir, ctx.config);
    await this.ensureWorkspaceMarker(ctx.projectRootDir);
  }

  async mergeIntoRoot(): Promise<void> {
    const ctx = this.requireBackendContext();
    await ctx.backend.mergeWorkspace({
      projectRootDir: ctx.projectRootDir,
      workspaceDir: this.workingDir,
      name: ctx.name,
    });
  }

  async removeFromRoot(options?: { force?: boolean }): Promise<void> {
    const ctx = this.requireBackendContext();
    await ctx.backend.removeWorkspace({
      projectRootDir: ctx.projectRootDir,
      workspaceDir: this.workingDir,
      name: ctx.name,
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
      // lazy: workspaceDir might not exist before backend creates it
      this.gitClient = simpleGit(this.workingDir);
    }
    return this.gitClient;
  }

  private requireBackendContext(): WorkspaceBackendContext {
    if (!this.backendContext) {
      throw new Error('Workspace is missing backend context');
    }
    return this.backendContext;
  }

  private requireCreateContext(): Required<WorkspaceBackendContext> & {
    config: FleetConfig;
  } {
    const ctx = this.requireBackendContext();
    if (!ctx.config) {
      throw new Error('Workspace is missing config');
    }
    return ctx as Required<WorkspaceBackendContext> & { config: FleetConfig };
  }

  private async ensureWorkspaceMarker(projectRootDir: string): Promise<void> {
    // IMPORTANT: .fleet may be untracked in the root and therefore absent in a worktree.
    await ensureDir(path.join(this.workingDir, '.fleet'));
    await writeFile(path.join(this.workingDir, '.fleet', '.workspace'), '');

    // Copy root .fleet/.gitignore into the workspace metadata folder (stealth mode support).
    const rootGitignore = path.join(projectRootDir, '.fleet', '.gitignore');
    const workspaceGitignore = path.join(this.workingDir, '.fleet', '.gitignore');

    if ((await pathExists(rootGitignore)) && !(await pathExists(workspaceGitignore))) {
      await copyFile(rootGitignore, workspaceGitignore);
    }
  }

  private async runPostInitSteps(targetDir: string, config: FleetConfig): Promise<void> {
    if (config.extraFiles.length) {
      const sourceDir = this.requireBackendContext().projectRootDir;
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
    targetDir: string,
    command: string,
  ): Promise<void> {
    try {
      execSync(command, {
        cwd: targetDir,
        stdio: 'inherit',
        env: process.env,
      });
    } catch (error: unknown) {
      throw new Error(
        `Post-init command failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
