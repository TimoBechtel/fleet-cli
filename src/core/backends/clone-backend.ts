import { ensureDir, remove } from 'fs-extra';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { FleetConfig } from '../config.js';
import type { Backend } from './backend.js';

export class CloneBackend implements Backend {
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
    const cloneArgs = baseBranch ? ['--branch', baseBranch] : [];
    await git.clone(projectRootDir, workspaceDir, cloneArgs);

    const workspaceGit = simpleGit(workspaceDir);
    await workspaceGit.checkoutLocalBranch(name);
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

    const tempRemoteName = `temp-${name}`;
    await git.addRemote(tempRemoteName, workspaceDir);

    try {
      await git.raw([
        'fetch',
        tempRemoteName,
        `${name}:refs/remotes/${tempRemoteName}/${name}`,
      ]);

      const mergeResult = await git.merge([
        `${tempRemoteName}/${name}`,
        '-m',
        `Merge branch '${name}'`,
      ]);
      if (mergeResult.conflicts.length > 0) {
        const relativePath = path.relative(process.cwd(), projectRootDir);
        throw new Error(
          `\nMerge conflicts detected. \nPlease resolve them manually in "${relativePath}" and complete the merge.`,
        );
      }
    } finally {
      try {
        await git.removeRemote(tempRemoteName);
      } catch {
        // ignore if remote doesn't exist
      }
    }

    try {
      await git.branch(['-d', name]);
    } catch {
      // branch deletion might fail if it was already deleted or doesn't exist
    }

    await remove(workspaceDir);
  }

  async removeWorkspace({
    workspaceDir,
  }: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    force?: boolean;
  }): Promise<void> {
    await remove(workspaceDir);
  }

  async matchesWorkspaceDir(): Promise<boolean> {
    // Clone backend is the fallback when a workspace dir is not registered as a worktree.
    return true;
  }
}
