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
  return async function completeCommand(
    resource?: string,
    target?: string,
    options?: { withDescriptions?: boolean },
  ) {
    if (resource === 'workspaces') {
      const fleet = await FleetProject.ensureFleetProject();
      const workspaces = await fleet.getWorkspaces();
      for (const workspace of workspaces) {
        console.log(workspace);
      }
      return;
    }

    if (resource === 'commands') {
      const includeDescriptions = options?.withDescriptions ?? false;
      const commands = getTopLevelCommands(program, includeDescriptions);
      printCompletionLines(commands);
      return;
    }

    if (resource === 'options') {
      const includeDescriptions = options?.withDescriptions ?? false;
      const targetCommand = target;
      if (!targetCommand) {
        process.exit(1);
      }

      const optionEntries = getCommandOptions(
        program,
        targetCommand,
        includeDescriptions,
      );
      printCompletionLines(optionEntries);
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
  if [[ "$cur" == -* ]]; then
    local options
    options="$(fleet __complete options "$cmd" 2>/dev/null)"
    COMPREPLY=( $(compgen -W "$options" -- "$cur") )
    return 0
  fi

  if [ $COMP_CWORD -ne 2 ]; then
    return 1
  fi

  case "$cmd" in
    ${workspaceCommands})
      local workspaces
      workspaces="$(fleet __complete workspaces 2>/dev/null)"
      COMPREPLY=( $(compgen -W "$workspaces" -- "$cur") )
      return 0
      ;;
  esac
}

complete -o default -o bashdefault -F _fleet_complete fleet
`;
}

function zshCompletionScript(): string {
  const workspacePattern = WORKSPACE_SUBCOMMANDS.join('|');

  return `#compdef fleet

_fleet_complete_commands() {
  local -a completions
  local token desc
  while IFS=$'\t' read -r token desc; do
    [ -z "$token" ] && continue
    if [ -n "$desc" ]; then
      completions+=("$token:$desc")
    else
      completions+=("$token")
    fi
  done < <(fleet __complete commands --with-descriptions 2>/dev/null)

  _describe -t commands 'fleet commands' completions
}

_fleet_complete_options() {
  local cmd="$1"
  local -a completions
  local token desc
  while IFS=$'\t' read -r token desc; do
    [ -z "$token" ] && continue
    if [ -n "$desc" ]; then
      completions+=("$token:$desc")
    else
      completions+=("$token")
    fi
  done < <(fleet __complete options "$cmd" --with-descriptions 2>/dev/null)

  _describe -t options 'options' completions
}

_fleet_complete_workspaces() {
  local -a workspaces
  workspaces=($(fleet __complete workspaces 2>/dev/null))
  compadd -a workspaces
}

_fleet() {
  local cmd
  cmd="$words[2]"

  if (( CURRENT == 2 )); then
    _fleet_complete_commands
    return
  fi

  if [[ "$words[CURRENT]" == -* ]]; then
    _fleet_complete_options "$cmd"
    return
  fi

  if (( CURRENT == 3 )); then
    case "$cmd" in
      ${workspacePattern})
        _fleet_complete_workspaces
        return
        ;;
    esac
  fi

  return 1
}

compdef _fleet fleet
`;
}

function fishCompletionScript(): string {
  const workspaceCommands = WORKSPACE_SUBCOMMANDS.join(' ');

  return `# fish completion for fleet
function __fleet_complete_commands
  fleet __complete commands --with-descriptions 2>/dev/null
end

function __fleet_current_subcommand
  set -l tokens (commandline -opc)
  if test (count $tokens) -ge 2
    echo $tokens[2]
  end
end

function __fleet_complete_options
  set -l cmd (__fleet_current_subcommand)
  if test -n "$cmd"
    fleet __complete options $cmd --with-descriptions 2>/dev/null
  end
end

function __fleet_needs_option
  set -l cur (commandline -ct)
  if string match -r '^-' -- $cur >/dev/null
    return 0
  end
  return 1
end

function __fleet_needs_workspace
  set -l tokens (commandline -opc)
  if test (count $tokens) -ge 2
    set -l cmd $tokens[2]
    switch $cmd
      case ${workspaceCommands}
        if test (count $tokens) -eq 2
          return 0
        end
    end
  end
  return 1
end

complete -c fleet -f -n '__fish_use_subcommand' -a '(__fleet_complete_commands)'
complete -c fleet -f -n '__fleet_needs_option' -a '(__fleet_complete_options)'
complete -c fleet -f -n '__fleet_needs_workspace' -a '(fleet __complete workspaces 2>/dev/null)'
`;
}

type CompletionLine = { token: string; description?: string };

function getTopLevelCommands(
  program: Command,
  includeDescriptions: boolean,
): CompletionLine[] {
  const entries: CompletionLine[] = [];
  const seen = new Set<string>();

  for (const command of program.commands) {
    if (isHiddenCommand(command)) continue;

    const description = command.description() || '';
    const name = command.name();
    if (name && shouldIncludeCommandName(name)) {
      addCompletion(entries, seen, name, description, includeDescriptions);
    }

    for (const alias of command.aliases()) {
      if (alias && shouldIncludeCommandName(alias)) {
        addCompletion(entries, seen, alias, description, includeDescriptions);
      }
    }
  }

  return entries;
}

function getCommandOptions(
  program: Command,
  commandName: string,
  includeDescriptions: boolean,
): CompletionLine[] {
  const targetCommand = findCommand(program, commandName);
  if (!targetCommand) return [];

  const entries: CompletionLine[] = [];
  const seen = new Set<string>();

  for (const option of targetCommand.options) {
    if (option.long === '--help' || option.short === '-h') continue;

    const description = option.description || '';
    if (option.short) {
      addCompletion(entries, seen, option.short, description, includeDescriptions);
    }
    if (option.long) {
      addCompletion(entries, seen, option.long, description, includeDescriptions);
    }
  }

  return entries;
}

function findCommand(program: Command, commandName: string): Command | null {
  for (const command of program.commands) {
    if (command.name() === commandName) return command;
    if (command.aliases().includes(commandName)) return command;
  }
  return null;
}

function isHiddenCommand(command: Command): boolean {
  const hiddenFlag =
    typeof (command as Command & { hidden?: boolean }).isHidden === 'function'
      ? command.isHidden()
      : Boolean((command as Command & { hidden?: boolean }).hidden);

  if (hiddenFlag) return true;
  return !shouldIncludeCommandName(command.name());
}

function shouldIncludeCommandName(name: string): boolean {
  return name !== '-' && name !== '__complete' && name !== 'help';
}

function addCompletion(
  entries: CompletionLine[],
  seen: Set<string>,
  token: string,
  description: string,
  includeDescriptions: boolean,
) {
  if (seen.has(token)) return;
  seen.add(token);
  const sanitizedDescription = includeDescriptions
    ? sanitizeDescription(description)
    : undefined;
  entries.push(
    includeDescriptions ? { token, description: sanitizedDescription } : { token },
  );
}

function printCompletionLines(entries: CompletionLine[]) {
  for (const entry of entries) {
    if (entry.description !== undefined) {
      console.log(`${entry.token}\t${entry.description}`);
    } else {
      console.log(entry.token);
    }
  }
}

function sanitizeDescription(description: string): string {
  const firstLine = description.split('\n')[0] ?? '';
  return firstLine.replace(/\t/g, ' ');
}
