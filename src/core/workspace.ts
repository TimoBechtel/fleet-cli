import { copy, ensureDir, pathExists } from 'fs-extra';
import { execSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Backend } from './backends/backend.js';
import type { FleetConfig } from './config.js';

export class Workspace {
  private static readonly FALLBACK_DEFAULT_GIT_BRANCH = 'main';

  private git?: SimpleGit;
  private projectRootDir?: string;
  private name?: string;
  private backend?: Backend;
  private config?: FleetConfig;

  constructor(
    private workingDir: string,
    options?: {
      projectRootDir?: string;
      name?: string;
      backend?: Backend;
      config?: FleetConfig;
    },
  ) {
    this.projectRootDir = options?.projectRootDir;
    this.name = options?.name;
    this.backend = options?.backend;
    this.config = options?.config;
  }

  async create(baseBranch?: string): Promise<void> {
    const { projectRootDir, name, backend, config } = this.getCreateContext();
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

  async mergeIntoRoot(): Promise<void> {
    const { projectRootDir, name, backend } = this.getBackendContext();
    await backend.mergeWorkspace({
      projectRootDir,
      workspaceDir: this.workingDir,
      name,
    });
  }

  async removeFromRoot(options?: { force?: boolean }): Promise<void> {
    const { projectRootDir, name, backend } = this.getBackendContext();
    await backend.removeWorkspace({
      projectRootDir,
      workspaceDir: this.workingDir,
      name,
      force: options?.force,
    });
  }

  async isGitRoot(): Promise<boolean> {
    try {
      const gitDir = path.join(this.workingDir, '.git');
      return await pathExists(gitDir);
    } catch {
      return false;
    }
  }

  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.getGit().status();
      return status.files.length > 0;
    } catch {
      return false;
    }
  }

  async getTrackedDirtyFiles(): Promise<string[]> {
    try {
      const [unstaged, staged] = await Promise.all([
        this.getGit().diff(['--name-only']),
        this.getGit().diff(['--cached', '--name-only']),
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
      const result = await this.getGit().raw([
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
      ]);
      return result.trim().replace('refs/remotes/origin/', '');
    } catch {
      try {
        const current = await this.getGit().branch();
        return current.current || Workspace.FALLBACK_DEFAULT_GIT_BRANCH;
      } catch {
        return Workspace.FALLBACK_DEFAULT_GIT_BRANCH;
      }
    }
  }

  async isDiverged(projectRootDir: string): Promise<boolean> {
    try {
      const currentHead = await this.getGit().revparse(['HEAD']);
      const projectRootWorkspace = new Workspace(projectRootDir);
      const projectRootHead = await projectRootWorkspace
        .getGit()
        .revparse(['HEAD']);

      if (currentHead === projectRootHead) {
        return false;
      }

      const revList = await projectRootWorkspace.getGit().raw([
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
    return (await this.getGit().branch()).current || null;
  }

  async commitChanges(message: string): Promise<void> {
    await this.getGit().add('--all');
    await this.getGit().commit(message);
  }

  async initRepository(): Promise<void> {
    await this.getGit().init();
    await this.getGit().add('--all');
    await this.getGit().raw(['commit', '--allow-empty', '-m', 'Initial commit']);
  }

  private getGit(): SimpleGit {
    if (!this.git) {
      this.git = simpleGit(this.workingDir);
    }
    return this.git;
  }

  private getBackendContext(): {
    projectRootDir: string;
    name: string;
    backend: Backend;
  } {
    if (!this.projectRootDir || !this.name || !this.backend) {
      throw new Error('Workspace is missing project root context');
    }
    return {
      projectRootDir: this.projectRootDir,
      name: this.name,
      backend: this.backend,
    };
  }

  private getCreateContext(): {
    projectRootDir: string;
    name: string;
    backend: Backend;
    config: FleetConfig;
  } {
    const { projectRootDir, name, backend } = this.getBackendContext();
    if (!this.config) {
      throw new Error('Workspace is missing config');
    }
    return { projectRootDir, name, backend, config: this.config };
  }

  private async ensureWorkspaceMarker(): Promise<void> {
    if (!this.projectRootDir) {
      throw new Error('Workspace is missing project root context');
    }
    await ensureDir(path.join(this.workingDir, '.fleet'));
    await writeFile(path.join(this.workingDir, '.fleet', '.workspace'), '');
    const rootGitignore = path.join(this.projectRootDir, '.fleet', '.gitignore');
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
    targetDir: string,
    config: FleetConfig,
  ): Promise<void> {
    if (config.extraFiles.length) {
      const sourceDir = this.projectRootDir ?? this.workingDir;
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
