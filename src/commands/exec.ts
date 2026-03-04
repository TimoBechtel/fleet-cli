import chalk from 'chalk';
import { pathExists } from 'fs-extra';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { FleetProject } from '../core/fleet.js';
import { resolveWorkspaceDirectory } from '../core/utils.js';

export async function execCommand(
  workspaceOrDirectory: string,
  command: string,
  args?: string[],
  options: { add?: boolean; base?: string } = {},
) {
  try {
    let targetDir: string | null = null;

    let fleet = await FleetProject.findFleetProject();
    if (fleet) {
      targetDir = await resolveWorkspaceDirectory(fleet, workspaceOrDirectory);
      const looksLikeWorkspaceName =
        !workspaceOrDirectory.includes(path.sep) &&
        workspaceOrDirectory !== '.' &&
        workspaceOrDirectory !== '..';
      if (!targetDir && options.add && looksLikeWorkspaceName) {
        await fleet.createWorkspace(workspaceOrDirectory, options.base);
        targetDir = fleet.buildWorkspacePath(workspaceOrDirectory);
      }
    }

    if (!targetDir) {
      targetDir = path.resolve(workspaceOrDirectory);
      // target dir might be a fleet project, so switch to that one
      fleet = await FleetProject.findFleetProject(targetDir);
    }

    // check directory exists
    if (!(await pathExists(targetDir))) {
      console.error(
        chalk.red(`Error: directory or workspace does not exist: ${targetDir}`),
      );
      console.error(
        chalk.dim('Try: fleet exec --add <workspace> <command> [args...]'),
      );
      console.error(chalk.dim('Or: fleet add <workspace>'));
      process.exit(1);
    }

    // execute command
    const child = spawn(command, args || [], {
      stdio: 'inherit',
      cwd: targetDir,
      shell: true,
    });

    await new Promise<void>((_, reject) => {
      child.on('close', (code) => process.exit(code || 0));
      child.on('error', (error) => {
        console.error(
          chalk.red('Error: failed to execute command:'),
          error.message,
        );
        reject(error);
      });
    });
  } catch (error: unknown) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}
