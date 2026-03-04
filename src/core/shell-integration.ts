import chalk from 'chalk';
import fs, { ensureDir, pathExists } from 'fs-extra';
import { confirm } from '@inquirer/prompts';
import { execSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigManager } from './config';
import { promptOrExit } from './inquirer.js';

export class ShellIntegration {
  static detectShell(): string | null {
    const shell = process.env.SHELL;
    if (!shell) return null;

    if (shell.includes('zsh')) return 'zsh';
    if (shell.includes('bash')) return 'bash';
    if (shell.includes('fish')) return 'fish';

    return null;
  }

  static getShellConfigFile(shell: string | null): string | null {
    const homeDir = os.homedir();

    switch (shell) {
      case 'zsh': {
        return path.join(homeDir, '.zshrc');
      }
      case 'bash': {
        const bashrc = path.join(homeDir, '.bashrc');
        const bashProfile = path.join(homeDir, '.bash_profile');
        return fs.existsSync(bashrc) ? bashrc : bashProfile;
      }
      case 'fish': {
        return path.join(homeDir, '.config', 'fish', 'config.fish');
      }
      case null:
      default: {
        return null;
      }
    }
  }

  static async addIntegrationToShellConfig(configFile: string): Promise<void> {
    const integrationLine =
      '\n# Fleet shell integration\neval "$(fleet shell-code)"\n';

    await ensureDir(path.dirname(configFile));

    if (await pathExists(configFile)) {
      const content = await readFile(configFile, 'utf8');
      if (content.includes('fleet shell-code')) {
        return;
      }
    }

    await appendFile(configFile, integrationLine);

    execSync(`source ${configFile}`);
  }

  static getStateFilePath(): string {
    const configPath = ConfigManager.getGlobalConfigPath();
    const configDir = path.dirname(configPath);

    return path.join(configDir, `fleet-shell-cd.tmp`);
  }

  static async changeDirectory(
    targetDir: string,
    optional?: boolean,
  ): Promise<void> {
    if (process.env.FLEET_SHELL_INTEGRATION === 'true') {
      const stateFile = ShellIntegration.getStateFilePath();
      await ensureDir(path.dirname(stateFile));
      await writeFile(stateFile, targetDir);
    } else {
      const success = optional
        ? true
        : await ShellIntegration.promptAndSetupShellIntegration();
      if (!success) {
        console.log();
        const relativePath = path.relative(process.cwd(), targetDir);
        console.log(chalk.dim(`cd ${relativePath}`));
        console.log();
      }
    }
  }

  private static async promptAndSetupShellIntegration(): Promise<boolean> {
    const shell = ShellIntegration.detectShell();
    const configFile = ShellIntegration.getShellConfigFile(shell);

    if (!shell || !configFile) {
      return false;
    }

    console.log(chalk.yellow('Shell integration not set up'));
    console.log();
    console.log(
      'To be able to change directories, you need to set up the shell integration.',
    );

    const shouldSetup = await promptOrExit(
      confirm({
        message: `Add shell integration to ${configFile}?`,
        default: true,
      }),
    );

    console.log();

    if (shouldSetup) {
      try {
        await ShellIntegration.addIntegrationToShellConfig(configFile);
        console.log(chalk.green(`Done: added to ${configFile}`));
        console.log(
          chalk.blue('Restart terminal or run:'),
          chalk.cyan(`source ${configFile}`),
        );
        return true;
      } catch {
        console.log(chalk.yellow(`Warning: could not write to ${configFile}`));
        console.log(
          'Manual setup:',
          chalk.cyan(`echo 'eval "$(fleet shell-code)"' >> ${configFile}`),
        );
        return false;
      }
    } else {
      console.log(
        'Manual setup:',
        chalk.cyan(`echo 'eval "$(fleet shell-code)"' >> ${configFile}`),
      );
      return false;
    }
  }
}
