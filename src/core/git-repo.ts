import { pathExists } from 'fs-extra';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

/**
 * GitRepo is a thin wrapper around a git checkout on disk.
 *
 * It contains only git-and-filesystem operations. It does NOT know about Fleet
 * semantics (workspace lifecycle, backend selection, worktree vs clone, etc.).
 */
export class GitRepo {
  private static readonly FALLBACK_DEFAULT_GIT_BRANCH = 'main';

  private git: SimpleGit;

  constructor(private readonly workingDir: string) {
    this.git = simpleGit(workingDir);
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

  private async listTrackedDirtyFiles(): Promise<Set<string>> {
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
      return trackedDirtyFiles;
    } catch {
      return new Set();
    }
  }

  async matchDirtyFiles(patterns: string[]): Promise<string[]> {
    if (patterns.length === 0) return [];
    const trackedDirtyFiles = await this.listTrackedDirtyFiles();
    if (trackedDirtyFiles.size === 0) return [];

    const { glob } = await import('glob');
    const matchedFiles = new Set<string>();

    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { cwd: this.workingDir });
        for (const file of files) {
          if (trackedDirtyFiles.has(file)) {
            matchedFiles.add(file);
          }
        }
      } catch {
        continue;
      }
    }

    return [...matchedFiles];
  }

  /**
   * Checks if this checkout has diverged from the project root.
   * Returns true if there are commits in this checkout that are not in the project root.
   */
  async isDiverged(projectRootDir: string): Promise<boolean> {
    try {
      const currentHead = (await this.git.revparse(['HEAD'])).trim();
      const projectRootRepo = new GitRepo(projectRootDir);
      const projectRootHead = (
        await projectRootRepo.git.revparse(['HEAD'])
      ).trim();

      // if heads are the same, no divergence
      if (currentHead === projectRootHead) {
        return false;
      }

      const revList = await projectRootRepo.git.raw([
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
    return this.git
      .branch()
      .then((b) => b.current || null)
      .catch(() => null);
  }

  async commitChanges(message: string): Promise<void> {
    await this.git.add('--all');
    await this.git.commit(message);
  }

  async initRepository(): Promise<void> {
    await this.git.init();
    await this.git.add('--all');
    await this.git.raw(['commit', '--allow-empty', '-m', 'Initial commit']);
  }
}
