import { ensureDir } from 'fs-extra';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { FleetConfig } from '../config.js';
import type { Backend } from './backend.js';

export class WorktreeBackend implements Backend {
  async createWorkspace({
    projectRootDir,
    workspaceDir,
    name,
    baseBranch,
  }: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    config: FleetConfig;
    baseBranch?: string;
  }): Promise<void> {
    await ensureDir(path.dirname(workspaceDir));
    const git = simpleGit(projectRootDir);
    const gitArgs = ['worktree', 'add', '-b', name, workspaceDir];
    if (baseBranch) gitArgs.push(baseBranch);
    await git.raw(gitArgs);
  }

  async mergeWorkspace({
    projectRootDir,
    workspaceDir,
    name,
  }: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
  }): Promise<void> {
    const git = simpleGit(projectRootDir);

    try {
      await git.raw(['merge', name]);
    } catch {
      const relativePath = path.relative(process.cwd(), projectRootDir);
      throw new Error(
        `\nMerge conflicts detected. \nPlease resolve them manually in "${relativePath}" and complete the merge.`,
      );
    }

    await git.raw(['worktree', 'remove', workspaceDir]);
    await this.deleteBranch(git, name);
  }

  async removeWorkspace({
    projectRootDir,
    workspaceDir,
    name,
    force,
  }: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    force?: boolean;
  }): Promise<void> {
    const git = simpleGit(projectRootDir);
    const gitArgs = ['worktree', 'remove'];
    if (force) gitArgs.push('--force');
    gitArgs.push(workspaceDir);
    await git.raw(gitArgs);
    await this.deleteBranch(git, name, force);
  }

  async matchesWorkspaceDir({
    projectRootDir,
    workspaceDir,
  }: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<boolean> {
    const worktreePaths = await this.loadWorktreePaths(projectRootDir);
    return worktreePaths.has(path.resolve(workspaceDir));
  }

  private async deleteBranch(
    git: ReturnType<typeof simpleGit>,
    name: string,
    force?: boolean,
  ): Promise<void> {
    try {
      await git.branch([force ? '-D' : '-d', name]);
    } catch {
      // ignore if branch doesn't exist or can't be deleted
    }
  }

  private async loadWorktreePaths(
    projectRootDir: string,
  ): Promise<Set<string>> {
    try {
      const git = simpleGit(projectRootDir);
      const output = await git.raw(['worktree', 'list', '--porcelain']);
      const paths = new Set<string>();
      for (const line of output.split('\n')) {
        if (!line.startsWith('worktree ')) continue;
        const worktreePath = line.slice('worktree '.length).trim();
        if (worktreePath) {
          paths.add(path.resolve(worktreePath));
        }
      }
      return paths;
    } catch {
      return new Set<string>();
    }
  }
}
