import { Command } from 'commander';
import { cleanCommand } from './commands/clean.js';
import { completionCommand, createCompleteCommand } from './commands/completion.js';
import { configCommand } from './commands/config.js';
import { createCommand } from './commands/create.js';
import { deleteCommand } from './commands/delete.js';
import { execCommand } from './commands/exec.js';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';
import { mergeCommand } from './commands/merge.js';
import { shellCodeCommand } from './commands/shell-code.js';
import { switchCommand } from './commands/switch.js';
import packageJson from '../package.json';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('fleet')
    .description('AI Workspace manager')
    .version(packageJson.version);

  program
    .command('init')
    .description(
      'Initialize a new Fleet project or add Fleet to existing project',
    )
    .argument('[name]', 'Project name or directory', '.')
    .option('--stealth', 'Initialize a Fleet project without tracking .fleet/ in git')
    .action((name, options) => initCommand(name, options));

  program
    .command('exec')
    .alias('x')
    .description('Execute a command in a specified workspace or directory')
    .argument('<workspace-or-directory>', 'Workspace name or directory path')
    .argument('<command>', 'Command to execute')
    .argument('[args...]', 'Command arguments', [])
    .allowUnknownOption()
    .action(execCommand);

  program
    .command('add')
    .description('Create a new workspace')
    .argument('<name>', 'Workspace name')
    .option(
      '-b, --base <branch>',
      'Clone from specific branch instead of current',
    )
    .option('-s, --switch', 'Switch to the new workspace after creation')
    .option('--backend <backend>', 'Workspace backend (worktree|clone)')
    .action(createCommand);

  program
    .command('switch')
    .alias('sw')
    .description('Navigate to a specific workspace')
    .argument('[workspace]', 'Workspace to switch to')
    .option('-a, --add', "Create workspace if it doesn't exist")
    .option('-b, --base <branch>', 'Clone from specific branch instead of current')
    .option('--backend <backend>', 'Workspace backend (worktree|clone)')
    .option('-r, --root', 'Switch to project root')
    .action(switchCommand);

  program
    .command('-', { hidden: true })
    .description('Switch to project root')
    .action(() => switchCommand(undefined, { root: true }));

  program
    .command('ls')
    .alias('list')
    .description('List all workspaces and their git state')
    .option('-v, --verbose', 'Show detailed git info per workspace')
    .action((options) => listCommand(options));

  program
    .command('clean')
    .description('Remove merged workspaces safely')
    .option('-y, --yes', 'Skip interactive confirmation')
    .action((options) => cleanCommand(options));

  program
    .command('rm')
    .description('Delete a workspace directory')
    .argument('<workspace>', 'Workspace name to delete')
    .option(
      '-f, --force',
      'Delete even if workspace has uncommitted changes or diverged commits',
    )
    .action((workspace, options) => deleteCommand(workspace, options));

  program
    .command('merge')
    .description(
      'Merge the given workspace into the project root and remove it afterwards.\nWill be merged into the current checked-out branch.',
    )
    .argument('<workspace>', 'Workspace name to merge')
    .option('-y, --yes', 'Skip interactive confirmation')
    .action((workspace, options) => mergeCommand(workspace, options));

  program
    .command('config')
    .description('Manage configuration')
    .argument('<action>', 'Action to perform (show)')
    .action(configCommand);

  program
    .command('shell-code')
    .description(
      'Shell integration code for directory changing.\nAdd "eval "$(fleet shell-code)" to your shell config file to enable it.',
    )
    .option('--shell <shell>', 'Shell type (bash, zsh, fish)')
    .action(shellCodeCommand);

  program
    .command('completion')
    .description('Generate shell completion script')
    .option('--shell <shell>', 'Shell type (bash, zsh, fish)')
    .action(completionCommand);

  program
    .command('__complete', { hidden: true })
    .description('Internal completion helper')
    .argument('<resource>', 'Resource to complete')
    .argument('[target]', 'Target command for options')
    .option('--with-descriptions', 'Include descriptions in output')
    .action(createCompleteCommand(program));

  return program;
}
