import chalk from 'chalk';
import { ensureDir, pathExists } from 'fs-extra';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { FleetProject } from '../core/fleet.js';
import { ShellIntegration } from '../core/shell-integration.js';
import { Workspace } from '../core/workspace.js';

export async function initCommand(name?: string) {
  try {
    const targetDir =
      name === '.' || name === undefined ? process.cwd() : path.resolve(name);

    // Check if already a Fleet project
    if (await FleetProject.findFleetProject(targetDir)) {
      console.error(
        chalk.red(
          'Error: directory is already a Fleet project or within a Fleet project',
        ),
      );
      process.exit(1);
    }

    const fleetDir = path.join(targetDir, '.fleet');
    if (await pathExists(fleetDir)) {
      console.error(
        chalk.red(
          'Error: target directory already contains a .fleet directory. Remove it or choose a different directory.',
        ),
      );
      process.exit(1);
    }

    const isNewProject =
      // either not exist yet, or is empty
      !(await pathExists(targetDir)) || (await readdir(targetDir)).length === 0;

    const isGitRepo = await Workspace.isGitRoot(targetDir);

    if (!isNewProject) {
      if (!isGitRepo) {
        console.error(
          chalk.red(
            'Error: directory is not empty and not the root of a git repository',
          ),
        );
        process.exit(1);
      }

    }

    if (isNewProject) {
      console.log(chalk.blue('Creating new Fleet project...'));
    } else {
      console.log(chalk.blue('Initializing Fleet in existing project...'));
    }

    await ensureDir(targetDir);

    // Initialize git if this is a new project and no git repo exists
    const workspace = new Workspace(targetDir);
    if (isNewProject && !isGitRepo) {
      await workspace.initRepository();
    }

    await FleetProject.init(targetDir);

    if (isNewProject) {
      await workspace.commitChanges('Initialize Fleet');
    }

    console.log();
    console.log(chalk.green('Done: Fleet project initialized'));
    if (isNewProject) {
      await ShellIntegration.changeDirectory(targetDir, true);
    }
    console.log();
    console.log(chalk.dim('Next:'));
    console.log(chalk.dim(`  fleet add <name>        # Create a workspace`));
    console.log(chalk.dim(`  fleet switch <name>     # Switch to a workspace`));
    console.log(
      chalk.dim(`  fleet exec <workspace> <cmd>  # Run command in workspace`),
    );
    console.log(chalk.dim('  fleet ls                # List workspaces'));
  } catch (error: unknown) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : JSON.stringify(error, null, 2),
    );
    process.exit(1);
  }
}
