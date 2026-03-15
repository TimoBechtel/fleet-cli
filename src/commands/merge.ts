import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { GitRepo } from '../core/git-repo.js';

export async function mergeCommand(
  workspaceName: string,
  options?: { yes?: boolean },
) {
  try {
    const fleet = await FleetProject.ensureFleetProject();

    const workspace = await fleet.getWorkspace(workspaceName);

    const repo = new GitRepo(workspace.directory);

    if (await repo.hasUncommittedChanges()) {
      console.error(chalk.red('Error: workspace is not ready to merge'));
      console.error(chalk.red('  Workspace has uncommitted changes'));
      process.exit(1);
    }

    console.log(chalk.green('Ready to merge'));
    console.log();

    const projectRootRepo = new GitRepo(fleet.root);
    const currentBranch = await projectRootRepo.getCurrentBranch();

    if (!options?.yes) {
      const confirmed = await confirm({
        message: `Merge workspace "${workspace.name}" into the project root ${
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
        `Done: merged "${workspace.name}" into project root${
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
