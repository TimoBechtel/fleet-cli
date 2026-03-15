import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { pathExists } from 'fs-extra';
import { Backend } from '../core/backends/backend.js';
import type { FleetConfig } from '../core/config.js';
import { FleetProject } from '../core/fleet.js';
import { GitRepo } from '../core/git-repo.js';
import { Workspace } from '../core/workspace.js';

export async function cleanCommand(options?: { yes?: boolean }) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    console.log(chalk.blue('Scanning for workspaces ready for cleanup...'));
    console.log();

    const workspaces = await fleet.getWorkspaces();
    const cleanableWorkspaces: CleanableWorkspace[] = [];

    for (const workspaceName of workspaces) {
      const workspaceDir = fleet.buildWorkspacePath(workspaceName);
      const cleanable = await checkDirectoryCleanable({
        workspaceName,
        workspaceDir,
        projectRootDir: fleet.root,
        config: fleet.config,
      });

      if (cleanable) {
        cleanableWorkspaces.push(cleanable);
      }
    }

    if (cleanableWorkspaces.length === 0) {
      console.log(chalk.green('Done: no workspaces ready for cleanup'));
      return;
    }

    console.log(
      chalk.bold(
        `Workspaces ready for cleanup (${cleanableWorkspaces.length}):`,
      ),
    );
    console.log();

    cleanableWorkspaces.forEach((dir) => {
      console.log(`  - ${chalk.bold(dir.name)}`);
      dir.reason.forEach((reason) => {
        console.log(chalk.dim(`    ${reason}`));
      });
    });

    console.log();

    if (!options?.yes) {
      const confirmed = await confirm({
        message: `Remove ${cleanableWorkspaces.length} directories?`,
        default: false,
      });

      if (!confirmed) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    let removedCount = 0;
    for (const dir of cleanableWorkspaces) {
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

interface CleanableWorkspace {
  name: string;
  path: string;
  reason: string[];
  workspace: Workspace;
}

async function checkDirectoryCleanable({
  workspaceName,
  workspaceDir,
  projectRootDir,
  config,
}: {
  workspaceName: string;
  workspaceDir: string;
  projectRootDir: string;
  config: FleetConfig;
}): Promise<CleanableWorkspace | null> {
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
    config,
  });
  const repo = new GitRepo(workspaceDir);

  const cleanable: CleanableWorkspace = {
    name: workspaceName,
    path: workspaceDir,
    reason: [],
    workspace,
  };

  if (await repo.hasUncommittedChanges()) {
    return null;
  }

  try {
    if (!(await repo.isDiverged(projectRootDir))) {
      cleanable.reason.push(`Workspace is merged into project root`);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return cleanable.reason.length > 0 ? cleanable : null;
}
