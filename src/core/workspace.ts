import { ensureDir, pathExists } from 'fs-extra';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Backend } from './backends/backend.js';
import type { FleetConfig } from './config.js';
import { GitRepo } from './git-repo.js';

// TODO: i think we should inject the fleet project into the workspace, so that we don't have to pass the config around. and create workspace from fleet project?

/**
 * Fleet Workspace (user-facing concept).
 *
 * A workspace is a named checkout living at `.fleet/workspaces/<name>`.
 *
 * Backend-specific behavior (clone vs worktree) is delegated to `backend`.
 */
export class Workspace {
  constructor(
    private readonly ctx: {
      projectRootDir: string;
      workspaceDir: string;
      name: string;
      backend: Backend;
      config?: FleetConfig;
    },
  ) {}

  async create(baseBranch?: string): Promise<void> {
    if (!this.ctx.config) {
      throw new Error('Workspace.create() requires config');
    }

    await this.ctx.backend.createWorkspace({
      projectRootDir: this.ctx.projectRootDir,
      workspaceDir: this.ctx.workspaceDir,
      name: this.ctx.name,
      config: this.ctx.config,
      baseBranch,
    });

    // IMPORTANT: `.fleet` may be untracked in the root and therefore absent in a worktree.
    // Always create the metadata folder + marker in the new checkout.
    await this.ensureWorkspaceMarker();

    await this.runPostInitSteps();
  }

  async mergeIntoRoot(): Promise<void> {
    await this.ctx.backend.mergeWorkspace({
      projectRootDir: this.ctx.projectRootDir,
      workspaceDir: this.ctx.workspaceDir,
      name: this.ctx.name,
    });
  }

  async remove(options?: { force?: boolean }): Promise<void> {
    await this.ctx.backend.removeWorkspace({
      projectRootDir: this.ctx.projectRootDir,
      workspaceDir: this.ctx.workspaceDir,
      name: this.ctx.name,
      force: options?.force,
    });
  }

  private async ensureWorkspaceMarker(): Promise<void> {
    await ensureDir(path.join(this.ctx.workspaceDir, '.fleet'));
    await writeFile(path.join(this.ctx.workspaceDir, '.fleet', '.workspace'), '');

    // Copy root .fleet/.gitignore into the workspace metadata folder (stealth mode support).
    const rootGitignore = path.join(this.ctx.projectRootDir, '.fleet', '.gitignore');
    const workspaceGitignore = path.join(this.ctx.workspaceDir, '.fleet', '.gitignore');

    if ((await pathExists(rootGitignore)) && !(await pathExists(workspaceGitignore))) {
      await copyFile(rootGitignore, workspaceGitignore);
    }
  }

  private async runPostInitSteps(): Promise<void> {
    const config = this.ctx.config;
    if (!config) return;

    if (config.extraFiles.length) {
      const rootRepo = new GitRepo(this.ctx.projectRootDir);
      await rootRepo.copyExtraFiles({
        sourceDir: this.ctx.projectRootDir,
        targetDir: this.ctx.workspaceDir,
        patterns: config.extraFiles,
      });
    }

    if (config.postInitCommand) {
      const wsRepo = new GitRepo(this.ctx.workspaceDir);
      await wsRepo.runPostInitCommand(config.postInitCommand);
    }
  }
}
