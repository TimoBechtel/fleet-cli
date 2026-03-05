import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { ShellIntegration } from '../core/shell-integration.js';
import {
  getCurrentWorkspaceName,
  resolveWorkspaceDirectory,
} from '../core/utils.js';

export async function switchCommand(
  workspaceName?: string,
  options?: {
    add?: boolean;
    root?: boolean;
    base?: string;
    backend?: string;
  },
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

      const choices = [...workspaces].filter(
        // don't show current workspace in list
        (workspace) => workspace !== currentWorkspaceName,
      );

      // if we're in a workspace, add project root to the list
      if (currentWorkspaceName) {
        choices.unshift(rootWorkspaceValue);
      }

      console.log(
        chalk.dim(
          `Current workspace: ${currentWorkspaceName ?? 'project root'}`,
        ),
      );
      console.log();

      const selectedWorkspace = await select({
        message: 'Select a workspace:',
        choices: choices.map((workspace) => ({
          name:
            workspace === rootWorkspaceValue ? `- project root -` : workspace,
          value: workspace,
        })),
      });

      workspaceName = selectedWorkspace;
    }

    if (!workspaceName) {
      console.error(chalk.red('Error: no workspace available to switch to'));
      console.error(chalk.dim('Try: fleet switch -a <name>'));
      process.exit(1);
    }

    targetDir =
      workspaceName === rootWorkspaceValue
        ? fleet.root
        : await resolveWorkspaceDirectory(fleet, workspaceName);

    if (!targetDir) {
      if (options?.add) {
        const backend = parseBackendOption(options.backend);
        await fleet.createWorkspace(workspaceName, options.base, backend);
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
            `  fleet switch -a ${workspaceName}    # Create workspace and switch`,
          ),
        );
        console.log(
          chalk.dim(
            `  fleet add ${workspaceName}           # Create workspace`,
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

function parseBackendOption(
  backend?: string,
): 'worktree' | 'clone' | undefined {
  if (!backend) return undefined;
  if (backend === 'worktree' || backend === 'clone') return backend;
  throw new Error(
    `Invalid backend "${backend}". Use "worktree" or "clone".`,
  );
}
