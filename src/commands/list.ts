import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { GitRepo } from '../core/git-repo.js';
import { getCurrentWorkspaceName } from '../core/utils.js';

export async function listCommand(opts?: { verbose?: boolean }) {
  try {
    const fleet = await FleetProject.ensureFleetProject();
    const currentDir = process.cwd();
    const verbose = opts?.verbose ?? false;

    const currentWorkspaceName = await getCurrentWorkspaceName(
      currentDir,
      fleet,
    );

    const workspaces = await fleet.getWorkspaces();
    const ordered =
      currentWorkspaceName && workspaces.includes(currentWorkspaceName)
        ? [
            currentWorkspaceName,
            ...workspaces.filter((d) => d !== currentWorkspaceName),
          ]
        : workspaces;

    if (ordered.length > 0) {
      for (const workspaceName of ordered) {
        await printWorkspaceStatus(
          workspaceName,
          fleet,
          workspaceName === currentWorkspaceName,
          verbose,
        );
      }
    } else {
      console.log(chalk.dim('No workspaces'));
    }

    // Show quick actions if we're in a workspace
    if (process.stdout.isTTY && currentWorkspaceName) {
      console.log();
      console.log(chalk.dim('Next:'));
      console.log(
        chalk.dim('  fleet switch --root    # Switch to project root'),
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  }
}

async function printWorkspaceStatus(
  name: string,
  fleet: FleetProject,
  isCurrent: boolean,
  verbose: boolean,
) {
  const dirPath = fleet.buildWorkspacePath(name);

  const gitStatus = await getGitStatus(dirPath);

  const label = isCurrent ? `${name} (current)` : name;
  let line = `  ${gitStatus.indicator} ${chalk.bold(label)}`;
  if (isCurrent) line = chalk.cyan(line);
  console.log(line);

  if (verbose && gitStatus.isRepo) {
    const repo = new GitRepo(dirPath);
    const branch = (await repo.getCurrentBranch()) ?? 'unknown';
    const hasChanges = await repo.hasUncommittedChanges();
    const diverged = await repo.isDiverged(fleet.root);
    console.log(chalk.dim(`    branch: ${branch}`));
    console.log(chalk.dim(`    state: ${hasChanges ? 'dirty' : 'clean'}`));
    console.log(chalk.dim(`    diverged: ${diverged ? 'yes' : 'no'}`));
  } else if (verbose && !gitStatus.isRepo) {
    console.log(chalk.dim(`    branch: unknown`));
    console.log(chalk.dim(`    state: n/a`));
    console.log(chalk.dim(`    diverged: no`));
  }
}

async function getGitStatus(dirPath: string) {
  if (await GitRepo.isGitRoot(dirPath)) {
    const repo = new GitRepo(dirPath);
    const hasChanges = await repo.hasUncommittedChanges();
    return {
      isRepo: true,
      hasChanges,
      indicator: hasChanges ? chalk.yellow('●') : chalk.green('●'),
    };
  }
  return {
    isRepo: false,
    hasChanges: false,
    indicator: chalk.gray('○'),
  };
}
