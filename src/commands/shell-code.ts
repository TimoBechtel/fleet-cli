import chalk from 'chalk';
import { ShellIntegration } from '../core/shell-integration';

export async function shellCodeCommand(options: { shell?: string } = {}) {
  const detectedShell = options.shell || detectShell();

  if (!detectedShell) {
    console.error(
      chalk.red('Error: could not detect shell. Use --shell to specify'),
    );
    console.log('Supported shells: bash, zsh, fish');
    process.exit(1);
  }

  try {
    const shellFunction = generateShellFunction(detectedShell);
    console.log(shellFunction);
  } catch (error: unknown) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

function detectShell(): string | null {
  const shell = process.env.SHELL;
  if (!shell) return null;

  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';

  return null;
}

function generateShellFunction(shell: string): string {
  switch (shell) {
    case 'zsh':
    case 'bash': {
      return `fleet() {
    if [[ "$1" == "switch" || "$1" == "-" ]]; then
        local state_file="${ShellIntegration.getStateFilePath()}"
        
        FLEET_SHELL_INTEGRATION=true command fleet "$@"
        local exit_code=$?
        
        if [ $exit_code -eq 0 ] && [ -f "$state_file" ]; then
            local target_dir=$(cat "$state_file")
           rm -f "$state_file"
            
            if [ -n "$target_dir" ]; then
                cd "$target_dir"
            fi
        fi
        
        return $exit_code
    else
        command fleet "$@"
    fi
}`;
    }

    case 'fish': {
      return `function fleet
    if test "$argv[1]" = "switch"; or test "$argv[1]" = "-"
        set state_file "${ShellIntegration.getStateFilePath()}"
        
        env FLEET_SHELL_INTEGRATION=true command fleet $argv
        set exit_code $status
        
        if test $exit_code -eq 0; and test -f $state_file
            set target_dir (cat $state_file)
            rm -f $state_file
            
            if test -n "$target_dir"
                cd $target_dir
            end
        end
        
        return $exit_code
    else
        command fleet $argv
    end
end`;
    }

    default: {
      throw new Error(`Unsupported shell: ${shell}`);
    }
  }
}
