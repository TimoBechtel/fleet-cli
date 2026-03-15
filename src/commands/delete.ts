import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { GitRepo } from '../core/git-repo.js';

export async function deleteCommand(
  workspaceName: string,
  options?: { force?: boolean },
) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    const workspace = await fleet.getWorkspace(workspaceName);

    if (!options?.force) {
      const repo = new GitRepo(workspace.directory);
      if (await repo.hasUncommittedChanges()) {
        console.error(chalk.red('Error: workspace is not safe to delete'));
        console.error(chalk.red('  Workspace has uncommitted changes'));
        console.error(
          chalk.dim('   Use --force to delete anyway (changes will be lost)'),
        );
        process.exit(1);
      }

      if (await repo.isDiverged(fleet.root)) {
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
      message: `Delete workspace "${workspace.name}"?`,
      default: false,
    });

    if (!confirmed) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    await workspace.remove({ force: options?.force });
    console.log(chalk.green(`Done: deleted workspace "${workspace.name}"`));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}
