import { copy, ensureDir, pathExists } from 'fs-extra';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { FleetConfig } from './config.js';

// TODO: i think we should inject the fleet project into the workspace, so that we don't have to pass the config around. and create workspace from fleet project?
export class Workspace {
  private static readonly FALLBACK_DEFAULT_GIT_BRANCH = 'main';

  private git: SimpleGit;

  constructor(private workingDir: string) {
    this.git = simpleGit(workingDir);
  }

  static async listWorktreePaths(projectRootDir: string): Promise<Set<string>> {
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

  static async isWorktreePath(
    projectRootDir: string,
    workspaceDir: string,
  ): Promise<boolean> {
    const worktrees = await Workspace.listWorktreePaths(projectRootDir);
    return worktrees.has(path.resolve(workspaceDir));
  }

  static async removeWorktree(
    projectRootDir: string,
    workspaceDir: string,
    force = false,
  ): Promise<void> {
    const git = simpleGit(projectRootDir);
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(workspaceDir);
    await git.raw(args);
  }

  static async deleteBranch(
    projectRootDir: string,
    branchName: string,
    force = false,
  ): Promise<void> {
    const git = simpleGit(projectRootDir);
    try {
      await git.branch([force ? '-D' : '-d', branchName]);
    } catch {
      // ignore if branch doesn't exist or can't be deleted
    }
  }

  static async mergeBranchIntoCurrent(
    projectRootDir: string,
    branchName: string,
  ): Promise<void> {
    const git = simpleGit(projectRootDir);
    await git.raw(['merge', branchName]);
  }

  static async isGitRoot(dir: string): Promise<boolean> {
    try {
      const gitDir = path.join(dir, '.git');
      return await pathExists(gitDir);
    } catch {
      return false;
    }
  }

  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return status.files.length > 0;
    } catch {
      return false;
    }
  }

  async getTrackedDirtyFiles(): Promise<string[]> {
    try {
      const [unstaged, staged] = await Promise.all([
        this.git.diff(['--name-only']),
        this.git.diff(['--cached', '--name-only']),
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
      // Try to get the default branch from remote HEAD
      const result = await this.git.raw([
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
      ]);
      return result.trim().replace('refs/remotes/origin/', '');
    } catch {
      try {
        // Fallback: get current branch
        const current = await this.git.branch();
        return current.current || Workspace.FALLBACK_DEFAULT_GIT_BRANCH;
      } catch {
        // Final fallback
        return Workspace.FALLBACK_DEFAULT_GIT_BRANCH;
      }
    }
  }

  /**
   * Checks if this workspace has diverged from the project root
   * Returns true if there are commits in this workspace that are not in the project root
   */
  async isDiverged(projectRootDir: string): Promise<boolean> {
    try {
      const currentHead = await this.git.revparse(['HEAD']);
      const projectRootWorkspace = new Workspace(projectRootDir);
      const projectRootHead = await projectRootWorkspace.git.revparse(['HEAD']);

      // if heads are the same, no divergence
      if (currentHead === projectRootHead) {
        return false;
      }

      const revList = await projectRootWorkspace.git.raw([
        'rev-list',
        '--left-right',
        '--count',
        `${projectRootHead}...${currentHead}`,
      ]);
      const [, rightCountRaw] = revList.trim().split(/\s+/);
      const rightCount = Number(rightCountRaw ?? 0);
      return rightCount > 0;
    } catch {
      return true; // assume diverged if we can't determine
    }
  }

  /**
   * Clones the workspace to the target directory
   *
   * @param targetDir Target directory for the clone
   * @param config Fleet configuration
   * @param branch Optional branch to clone from (defaults to current HEAD)
   * @returns The workspace
   */
  async clone(
    targetDir: string,
    config?: FleetConfig,
    branch?: string,
  ): Promise<Workspace> {
    await ensureDir(path.dirname(targetDir));

    await (branch
      ? this.git.clone(this.workingDir, targetDir, ['--branch', branch])
      : this.git.clone(this.workingDir, targetDir));

    if (config) {
      await this.runPostInitSteps(targetDir, config);
    }

    return new Workspace(targetDir);
  }

  async runPostInitSteps(
    targetDir: string,
    config: FleetConfig,
  ): Promise<void> {
    // Copy extra files first (before running post-init command)
    if (config.extraFiles.length) {
      await this.copyExtraFiles(this.workingDir, targetDir, config.extraFiles);
    }

    // Run post-init command
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

  async addWorktree(
    targetDir: string,
    branchName: string,
    baseBranch?: string,
  ): Promise<void> {
    await ensureDir(path.dirname(targetDir));
    const args = ['worktree', 'add', '-b', branchName, targetDir];
    if (baseBranch) args.push(baseBranch);
    await this.git.raw(args);
  }

  // TODO: add increment option to create branch with incrementing number if branch already exists (e.g. task-2-1)
  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
  }

  async getCurrentBranch(): Promise<string | null> {
    return (await this.git.branch()).current || null;
  }

  async commitChanges(message: string): Promise<void> {
    await this.git.add('--all');
    await this.git.commit(message);
  }

  async initRepository(): Promise<void> {
    await this.git.init();
    await this.git.add('--all');
    await this.git.commit('Initial commit');
  }

  /**
   * Merges a workspace directory into this workspace and removes the source workspace
   *
   * @param workspaceName Name of the workspace/branch being merged
   * @param workspaceDir Path to the workspace directory to merge from
   * @returns Promise that resolves when merge is complete
   */
  async mergeWorkspace(
    workspaceName: string,
    workspaceDir: string,
  ): Promise<void> {
    // we're merging into the current branch. user has to do a git checkout first, if they want to merge into a different branch

    // add the workspace directory as a temporary remote
    const tempRemoteName = `temp-${workspaceName}`;
    await this.git.addRemote(tempRemoteName, workspaceDir);

    try {
      // for some reason, this.git.fetch(tempRemoteName) doesn't work, so we're using raw git command instead
      await this.git.raw([
        'fetch',
        tempRemoteName,
        `${workspaceName}:refs/remotes/${tempRemoteName}/${workspaceName}`,
      ]);

      const mergeResult = await this.git.merge([
        `${tempRemoteName}/${workspaceName}`,
        '-m',
        `Merge branch '${workspaceName}'`, // use standard merge message (without remote-tracking branch name)
      ]);
      if (mergeResult.conflicts.length > 0) {
        const relativePath = path.relative(process.cwd(), this.workingDir);
        throw new Error(
          `\nMerge conflicts detected. \nPlease resolve them manually in "${relativePath}" and complete the merge.`,
        );
      }
    } finally {
      try {
        await this.git.removeRemote(tempRemoteName);
      } catch {
        // ignore if remote doesn't exist
      }
    }

    try {
      await this.git.branch(['-d', workspaceName]);
    } catch {
      // branch deletion might fail if it was already deleted or doesn't exist, that's ok
    }
  }
}
