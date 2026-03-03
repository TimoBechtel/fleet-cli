import type { Command } from 'commander';
import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { ShellIntegration } from '../core/shell-integration.js';

const WORKSPACE_SUBCOMMANDS = ['switch', 'sw', 'rm', 'merge', 'exec'];

export function completionCommand(options: { shell?: string } = {}) {
  const detectedShell = options.shell || ShellIntegration.detectShell();

  if (!detectedShell) {
    console.error(
      chalk.red('Error: could not detect shell. Use --shell to specify'),
    );
    console.log('Supported shells: bash, zsh, fish');
    process.exit(1);
  }

  try {
    const script = generateCompletionScript(detectedShell);
    console.log(script);
  } catch (error: unknown) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

export function createCompleteCommand(program: Command) {
  return async function completeCommand(resource?: string) {
    if (resource === 'workspaces') {
      const fleet = await FleetProject.ensureFleetProject();
      const workspaces = await fleet.getWorkspaces();
      for (const workspace of workspaces) {
        console.log(workspace);
      }
      return;
    }

    if (resource === 'commands') {
      const commands = getTopLevelCommandNames(program);
      for (const command of commands) {
        console.log(command);
      }
      return;
    }

    process.exit(1);
  };
}

function generateCompletionScript(shell: string): string {
  switch (shell) {
    case 'bash': {
      return bashCompletionScript();
    }
    case 'zsh': {
      return zshCompletionScript();
    }
    case 'fish': {
      return fishCompletionScript();
    }
    default: {
      throw new Error(`Unsupported shell: ${shell}`);
    }
  }
}

function bashCompletionScript(): string {
  const workspaceCommands = WORKSPACE_SUBCOMMANDS.join('|');

  return `# bash completion for fleet
_fleet_complete() {
  local cur cmd
  cur="\${COMP_WORDS[COMP_CWORD]}"

  if [ $COMP_CWORD -eq 1 ]; then
    local commands
    commands="$(fleet __complete commands 2>/dev/null)"
    COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    return 0
  fi

  cmd="\${COMP_WORDS[1]}"
  case "$cmd" in
    ${workspaceCommands})
      local workspaces
      workspaces="$(fleet __complete workspaces 2>/dev/null)"
      COMPREPLY=( $(compgen -W "$workspaces" -- "$cur") )
      return 0
      ;;
  esac
}

complete -F _fleet_complete fleet
`;
}

function zshCompletionScript(): string {
  return `# zsh completion for fleet (via bashcompinit)
autoload -Uz bashcompinit
bashcompinit
${bashCompletionScript()}`;
}

function fishCompletionScript(): string {
  const workspaceCommands = WORKSPACE_SUBCOMMANDS.join(' ');

  return `# fish completion for fleet
complete -c fleet -f -n '__fish_use_subcommand' -a '(fleet __complete commands 2>/dev/null)'
complete -c fleet -f -n '__fish_seen_subcommand_from ${workspaceCommands}' -a '(fleet __complete workspaces 2>/dev/null)'
`;
}

function getTopLevelCommandNames(program: Command): string[] {
  const names = new Set<string>();

  for (const command of program.commands) {
    const isHidden =
      typeof (command as Command & { hidden?: boolean }).isHidden === 'function'
        ? command.isHidden()
        : Boolean((command as Command & { hidden?: boolean }).hidden);

    if (isHidden) continue;

    const name = command.name();
    if (name && name !== '-' && name !== '__complete') {
      names.add(name);
    }

    for (const alias of command.aliases()) {
      if (alias && alias !== '-' && alias !== '__complete') {
        names.add(alias);
      }
    }
  }

  return Array.from(names);
}
