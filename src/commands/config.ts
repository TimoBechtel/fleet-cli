import chalk from 'chalk';
import { pathExistsSync } from 'fs-extra';
import path from 'node:path';
import { ConfigManager } from '../core/config.js';
import { FleetProject } from '../core/fleet.js';

export async function configCommand(action: string) {
  if (action === 'show') {
    try {
      // Try to find fleet project for context
      const fleet = await FleetProject.findFleetProject();
      const config =
        fleet?.config ?? (await ConfigManager.loadConfig(fleet?.root));

      console.log(chalk.blue('Fleet Configuration:'));
      console.log();

      if (fleet) {
        const configPath = ConfigManager.getProjectConfigFilePath(fleet.root);
        const relativePath = path.relative(process.cwd(), configPath);
        console.log(chalk.gray(`Project config: ${relativePath}`));
      }

      if (pathExistsSync(ConfigManager.getGlobalConfigPath())) {
        console.log(
          chalk.gray(`Global config: ${ConfigManager.getGlobalConfigPath()}`),
        );
      }
      console.log();

      console.log(JSON.stringify(config, null, 2));
    } catch (error: unknown) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  } else {
    console.error(chalk.red('Error: unknown action'));
    console.log('Available actions: show');
    process.exit(1);
  }
}
