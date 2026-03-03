import chalk from 'chalk';
import { FleetProject } from '../core/fleet.js';
import { ShellIntegration } from '../core/shell-integration.js';

const TOP_LEVEL_COMMANDS = [
  'init',
  'exec',
  'x',
  'new',
  'switch',
  'sw',
  '-',
  'ls',
  'list',
  'clean',
  'rm',
  'merge',
  'config',
  'shell-code',
  'completion',
];

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

export async function completeCommand(resource?: string) {
  if (resource !== 'workspaces') {
    process.exit(1);
  }

  const fleet = await FleetProject.ensureFleetProject();
  const workspaces = await fleet.getWorkspaces();
  for (const workspace of workspaces) {
    console.log(workspace);
  }
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
  const subcommands = TOP_LEVEL_COMMANDS.join(' ');
  const workspaceCommands = WORKSPACE_SUBCOMMANDS.join('|');

  return `# bash completion for fleet
_fleet_complete() {
  local cur cmd
  cur="\${COMP_WORDS[COMP_CWORD]}"

  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${subcommands}" -- "$cur") )
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
  const subcommands = TOP_LEVEL_COMMANDS.filter((cmd) => cmd !== '-')
    .map((cmd) => cmd.replace(/'/g, "\\'"))
    .join(' ');
  const workspaceCommands = WORKSPACE_SUBCOMMANDS.join(' ');

  return `# fish completion for fleet
complete -c fleet -f -n '__fish_use_subcommand' -a '${subcommands}'
complete -c fleet -f -n '__fish_seen_subcommand_from ${workspaceCommands}' -a '(fleet __complete workspaces 2>/dev/null)'
`;
}
