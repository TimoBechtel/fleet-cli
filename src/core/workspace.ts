import { copy, ensureDir, pathExists } from 'fs-extra';
import { execSync } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Backend } from './backends/backend.js';
import type { FleetConfig } from './config.js';

// TODO: i think we should inject the fleet project into the workspace, so that we don't have to pass the config around. and create workspace from fleet project?

/**
 * Fleet Workspace (user-facing concept).
 *
 * A workspace is a named checkout living at `.fleet/workspaces/<name>`.
 */
export class Workspace {
  constructor(
    private readonly ctx: {
      projectRootDir: string;
      workspaceDir: string;
      name: string;
      backend: Backend;
      config: FleetConfig;
    },
  ) {}

  async provision(baseBranch?: string): Promise<void> {
    await this.ctx.backend.createWorkspace({
      projectRootDir: this.ctx.projectRootDir,
      workspaceDir: this.ctx.workspaceDir,
      name: this.ctx.name,
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
      force: options?.force,
    });
  }

  private async ensureWorkspaceMarker(): Promise<void> {
    await ensureDir(path.join(this.ctx.workspaceDir, '.fleet'));
    await writeFile(
      path.join(this.ctx.workspaceDir, '.fleet', '.workspace'),
      '',
    );

    // Copy root .fleet/.gitignore into the workspace metadata folder (stealth mode support).
    const rootGitignore = path.join(
      this.ctx.projectRootDir,
      '.fleet',
      '.gitignore',
    );
    const workspaceGitignore = path.join(
      this.ctx.workspaceDir,
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

  private async runPostInitSteps(): Promise<void> {
    if (this.ctx.config.extraFiles.length) {
      await this.copyExtraFiles({
        sourceDir: this.ctx.projectRootDir,
        targetDir: this.ctx.workspaceDir,
        patterns: this.ctx.config.extraFiles,
      });
    }

    if (this.ctx.config.postInitCommand) {
      await this.runPostInitCommand(this.ctx.config.postInitCommand);
    }
  }

  private async runPostInitCommand(command: string): Promise<void> {
    try {
      execSync(command, {
        cwd: this.ctx.workspaceDir,
        stdio: 'inherit',
      });
    } catch (error: unknown) {
      throw new Error(
        `Post-init command failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async copyExtraFiles({
    sourceDir,
    targetDir,
    patterns,
  }: {
    sourceDir: string;
    targetDir: string;
    patterns: string[];
  }): Promise<void> {
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
}
