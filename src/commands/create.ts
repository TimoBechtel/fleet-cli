import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { ShellIntegration } from '../core/shell-integration.js';

interface CreateOptions {
  base?: string;
  switch?: boolean;
}

export async function createCommand(
  workspaceName: string,
  options: CreateOptions,
) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    await fleet.createWorkspace(workspaceName, options.base);

    console.log(chalk.green(`Done: workspace "${workspaceName}" created`));

    if (options.switch) {
      const targetDir = fleet.buildWorkspacePath(workspaceName);
      await ShellIntegration.changeDirectory(targetDir);
      return;
    }

    console.log();
    console.log(chalk.dim('Next steps:'));
    console.log(
      chalk.dim(`  fleet switch ${workspaceName}  # Navigate to workspace`),
    );
    console.log(chalk.dim(`  fleet ls                # List workspaces`));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}
