import chalk from 'chalk';
import { pathExists, remove } from 'fs-extra';
import { confirm } from '@inquirer/prompts';
import { FleetProject } from '../core/fleet.js';
import { isExitPromptError } from '../core/inquirer.js';
import { Workspace } from '../core/workspace.js';

export async function deleteCommand(
  workspaceName: string,
  options?: { force?: boolean },
) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

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

    if (!options?.force) {
      const workspace = new Workspace(workspaceDir);

      if (await workspace.hasUncommittedChanges()) {
        console.error(chalk.red('Error: workspace is not safe to delete'));
        console.error(chalk.red('  Workspace has uncommitted changes'));
        console.error(
          chalk.dim('   Use --force to delete anyway (changes will be lost)'),
        );
        process.exit(1);
      }

      if (await workspace.isDiverged(fleet.root)) {
        console.error(chalk.red('Error: workspace is not safe to delete'));
        console.error(
          chalk.red('  Workspace has commits not merged into project root'),
        );
        console.error(
          chalk.dim('   Use --force to delete anyway (commits will be lost)'),
        );
        process.exit(1);
      }
    }

    const confirmed = await confirm({
      message: `Delete workspace "${resolvedName}"?`,
      default: false,
    });

    if (!confirmed) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    await remove(workspaceDir);
    console.log(chalk.green(`Done: deleted workspace "${resolvedName}"`));
  } catch (error: unknown) {
    if (isExitPromptError(error)) {
      process.exitCode = 0;
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}
