import chalk from 'chalk';
import inquirer from 'inquirer';
import { FleetProject } from '../core/fleet.js';
import { ShellIntegration } from '../core/shell-integration.js';
import {
  getCurrentWorkspaceName,
  resolveWorkspaceDirectory,
} from '../core/utils.js';

export async function switchCommand(
  workspaceName?: string,
  options?: { create?: boolean; root?: boolean },
) {
  try {
    const rootWorkspaceValue = '__root__';
    let targetDir: string | null = null;

    const fleet = await FleetProject.ensureFleetProject();

    if (options?.root) {
      await ShellIntegration.changeDirectory(fleet.root);
      return;
    }

    if (!workspaceName) {
      const workspaces = await fleet.getWorkspaces();
      const currentWorkspaceName = await getCurrentWorkspaceName(
        process.cwd(),
        fleet,
      );
      const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

      console.log(
        chalk.dim(
          `Current workspace: ${currentWorkspaceName ?? 'project root'}`,
        ),
      );
      console.log();

      if (workspaces.length === 0) {
        console.error(chalk.red('Error: no workspaces available'));
        console.error(chalk.dim('Try: fleet new <name>'));
        process.exit(1);
      }

      if (!isInteractive) {
        console.log(chalk.dim('Available workspaces:'));
        for (const workspace of workspaces) {
          console.log(chalk.dim(`  - ${workspace}`));
        }
        console.log();
        console.error(chalk.red('Error: no workspace specified'));
        console.error(
          chalk.dim('Run: fleet switch <name> or fleet switch --root'),
        );
        process.exit(1);
      }

      const choices = [...workspaces].filter(
        // don't show current workspace in list
        (workspace) => workspace !== currentWorkspaceName,
      );

      // if we're in a workspace, add project root to the list
      if (currentWorkspaceName) {
        choices.unshift(rootWorkspaceValue);
      }

      const { selectedWorkspace } = await inquirer.prompt<{
        selectedWorkspace: string;
      }>([
        {
          type: 'list',
          name: 'selectedWorkspace',
          message: 'Select a workspace:',
          choices: choices.map((workspace) => ({
            name:
              workspace === rootWorkspaceValue ? `- project root -` : workspace,
            value: workspace,
          })),
        },
      ]);

      workspaceName = selectedWorkspace;
    }

    if (!workspaceName) {
      console.error(chalk.red('Error: no workspace available to switch to'));
      console.error(chalk.dim('Try: fleet switch -c <name>'));
      process.exit(1);
    }

    targetDir =
      workspaceName === rootWorkspaceValue
        ? fleet.root
        : await resolveWorkspaceDirectory(fleet, workspaceName);

    if (!targetDir) {
      if (options?.create) {
        await fleet.createWorkspace(workspaceName);
        targetDir = fleet.buildWorkspacePath(workspaceName);

        console.log(chalk.green(`Done: workspace "${workspaceName}" created`));
      } else {
        console.error(
          chalk.red(`Error: workspace "${workspaceName}" does not exist`),
        );
        console.log();
        console.log(chalk.dim('Try:'));
        console.log(
          chalk.dim(
            `  fleet switch -c ${workspaceName}    # Create workspace and switch`,
          ),
        );
        console.log(
          chalk.dim(
            `  fleet new ${workspaceName}           # Create workspace`,
          ),
        );
        process.exit(1);
      }
    }

    await ShellIntegration.changeDirectory(targetDir);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}
