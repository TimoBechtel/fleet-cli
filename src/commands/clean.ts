import chalk from 'chalk';
import { pathExists } from 'fs-extra';
import { confirm } from '@inquirer/prompts';
import { Backend } from '../core/backends/backend.js';
import { FleetProject } from '../core/fleet.js';
import { GitRepo } from '../core/git-repo.js';
import { Workspace } from '../core/workspace.js';

interface CleanableDirectory {
  name: string;
  path: string;
  reason: string[];
  workspace: Workspace;
}

export async function cleanCommand(options?: { yes?: boolean }) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    console.log(chalk.blue('Scanning for workspaces ready for cleanup...'));
    console.log();

    const workspaces = await fleet.getWorkspaces();
    const cleanableDirectories: CleanableDirectory[] = [];

    // Check each workspace
    for (const workspaceName of workspaces) {
      const workspaceDir = fleet.buildWorkspacePath(workspaceName);
      const cleanable = await checkDirectoryCleanable({
        workspaceName,
        workspaceDir,
        projectRootDir: fleet.root,
      });

      if (cleanable) {
        cleanableDirectories.push(cleanable);
      }
    }

    if (cleanableDirectories.length === 0) {
      console.log(chalk.green('Done: no workspaces ready for cleanup'));
      return;
    }

    // Display directories to be cleaned
    console.log(
      chalk.bold(
        `Workspaces ready for cleanup (${cleanableDirectories.length}):`,
      ),
    );
    console.log();

    cleanableDirectories.forEach((dir) => {
      console.log(`  - ${chalk.bold(dir.name)}`);
      dir.reason.forEach((reason) => {
        console.log(chalk.dim(`    ${reason}`));
      });
    });

    console.log();

    if (!options?.yes) {
      const confirmed = await confirm({
        message: `Remove ${cleanableDirectories.length} directories?`,
        default: false,
      });

      if (!confirmed) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    // Remove directories
    let removedCount = 0;
    for (const dir of cleanableDirectories) {
      try {
        await dir.workspace.remove();
        removedCount++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(`Error: failed to remove ${dir.name}:`),
          message,
        );
      }
    }

    console.log();
    console.log(chalk.green(`Done: removed ${removedCount} workspace(s)`));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}

async function checkDirectoryCleanable(args: {
  workspaceName: string;
  workspaceDir: string;
  projectRootDir: string;
}): Promise<CleanableDirectory | null> {
  const { workspaceName, workspaceDir, projectRootDir } = args;
  if (!(await pathExists(workspaceDir))) {
    return null;
  }

  const backend = await Backend.detect({
    projectRootDir,
    workspaceDir,
  });
  const workspace = new Workspace({
    projectRootDir,
    workspaceDir,
    name: workspaceName,
    backend,
  });
  const repo = new GitRepo(workspaceDir);

  const cleanable: CleanableDirectory = {
    name: workspaceName,
    path: workspaceDir,
    reason: [],
    workspace,
  };

  // Check for uncommitted changes
  if (await repo.hasUncommittedChanges()) {
    // Don't clean directories with uncommitted changes
    return null;
  }

  try {
    if (!(await repo.isDiverged(projectRootDir))) {
      cleanable.reason.push(`Workspace is merged into project root`);
    } else {
      // Don't clean diverged workspaces
      return null;
    }
  } catch {
    // If we can't check merge status, be conservative
    return null;
  }

  // Only clean if we have at least one good reason
  return cleanable.reason.length > 0 ? cleanable : null;
}
