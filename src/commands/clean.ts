import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { GitRepo } from '../core/git-repo.js';
import type { Workspace } from '../core/workspace.js';

export async function cleanCommand(options?: { yes?: boolean }) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    console.log(chalk.blue('Scanning for workspaces ready for cleanup...'));
    console.log();

    const workspaces = await fleet.getWorkspaces();
    const cleanableWorkspaces: {
      workspace: Workspace;
      cleanable: CleanableResult;
    }[] = [];

    for (const workspaceName of workspaces) {
      const workspace = await fleet.getWorkspace(workspaceName);
      const cleanable = await checkWorkspaceCleanable({
        workspace,
        fleet,
      });

      if (cleanable.ok) {
        cleanableWorkspaces.push({
          workspace,
          cleanable,
        });
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

    cleanableWorkspaces.forEach(({ workspace, cleanable }) => {
      console.log(`  - ${chalk.bold(workspace.name)}`);
      cleanable.reason.forEach((reason) => {
        console.log(chalk.dim(`    ${reason}`));
      });
    });

    console.log();

    if (!options?.yes) {
      const confirmed = await confirm({
        message: `Remove ${cleanableWorkspaces.length} workspaces?`,
        default: false,
      });

      if (!confirmed) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    let removedCount = 0;
    for (const { workspace } of cleanableWorkspaces) {
      try {
        await workspace.remove();
        removedCount++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          chalk.red(`Error: failed to remove ${workspace.name}:`),
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

interface CleanableResult {
  ok: boolean;
  reason: string[];
}

async function checkWorkspaceCleanable({
  workspace,
  fleet,
}: {
  workspace: Workspace;
  fleet: FleetProject;
}): Promise<CleanableResult> {
  const repo = new GitRepo(workspace.directory);

  if (await repo.hasUncommittedChanges()) {
    return {
      ok: false,
      reason: ['Workspace has uncommitted changes'],
    };
  }

  if (!(await repo.isDiverged(fleet.root))) {
    return {
      ok: true,
      reason: ['Workspace is merged into project root'],
    };
  } else {
    return {
      ok: false,
      reason: ['Workspace is not merged into project root'],
    };
  }
}
