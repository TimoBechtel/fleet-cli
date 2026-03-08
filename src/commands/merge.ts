import chalk from 'chalk';
import { pathExists } from 'fs-extra';
import { confirm } from '@inquirer/prompts';
import { FleetProject } from '../core/fleet.js';
import { Workspace, openWorkspace } from '../core/workspace.js';

export async function mergeCommand(
  workspaceName: string,
  options?: { yes?: boolean },
) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    // resolve workspace name - could be task id or workspace name
    const workspaces = await fleet.getWorkspaces();
    const resolvedName = workspaces.includes(workspaceName)
      ? workspaceName
      : null;

    if (!resolvedName) {
      console.error(chalk.red(`Error: workspace "${workspaceName}" not found`));
      process.exit(1);
    }

    const workspaceDir = fleet.buildWorkspacePath(resolvedName);
    if (!(await pathExists(workspaceDir))) {
      console.error(
        chalk.red(
          `Error: workspace directory "${resolvedName}" does not exist`,
        ),
      );
      process.exit(1);
    }

    const workspace = await openWorkspace({
      projectRootDir: fleet.root,
      workspaceDir,
      name: resolvedName,
    });

    if (await workspace.hasUncommittedChanges()) {
      console.error(chalk.red('Error: workspace is not ready to merge'));
      console.error(chalk.red('  Workspace has uncommitted changes'));
      process.exit(1);
    }

    console.log(chalk.green('Ready to merge'));
    console.log();

    const projectRootWorkspace = new Workspace(fleet.root);
    const currentBranch = await projectRootWorkspace.getCurrentBranch();

    if (!options?.yes) {
      const confirmed = await confirm({
        message: `Merge workspace "${resolvedName}" into the project root ${
          currentBranch ? `(branch: ${currentBranch})` : ''
        }?`,
        default: false,
      });

      if (!confirmed) {
        console.log(chalk.yellow('Cancelled'));
        return;
      }
    }

    // perform the merge
    await workspace.mergeIntoRoot();

    console.log(
      chalk.green(
        `Done: merged "${resolvedName}" into project root${
          currentBranch ? ` (branch: ${currentBranch})` : ''
        }`,
      ),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}
