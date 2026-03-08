import { createDefu } from 'defu';
import { ensureDir, pathExists, readJSON, writeJSON } from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { z, ZodError } from 'zod';

// should be fully optional
const fleetConfigSchema = z.object({
  postInitCommand: z
    .string()
    .optional()
    .default(
      "if [ -f .gitmodules ] && git config --file .gitmodules --get-regexp '^submodule\\..*\\.path$' >/dev/null 2>&1; then git submodule update --init --recursive || true; fi; [ -f package.json ] && npx nypm i --frozen-lockfile || true",
    ),
  extraFiles: z.array(z.string()).optional().default(['.env*']),
});

export type FleetConfig = z.infer<typeof fleetConfigSchema>;
export type FleetConfigInput = z.input<typeof fleetConfigSchema>;

const CONFIG_PATHS = {
  global_config_filepath: path.join(
    os.homedir(),
    '.config',
    'fleet',
    'config.json',
  ),
  project_config_filename: '.fleet/config.json',
} as const;

// Custom defu instance that overrides arrays instead of merging them
const mergeConfig = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
});

export class ConfigManager {
  static async loadConfig(projectRoot?: string): Promise<FleetConfig> {
    const configs: FleetConfig[] = [];

    // project config
    if (projectRoot) {
      const projectConfig = await this.parseConfig(
        this.getProjectConfigFilePath(projectRoot),
      );
      if (projectConfig) {
        configs.push(projectConfig);
      }
    }

    // global config
    const globalConfig = await this.parseConfig(
      CONFIG_PATHS.global_config_filepath,
    );
    if (globalConfig) {
      configs.push(globalConfig);
    }

    const defaults = fleetConfigSchema.parse({});

    const merged =
      configs.length > 0 && configs[0]
        ? // Merge configs (left most arguments have priority)
          mergeConfig(configs[0], ...configs, defaults)
        : defaults;

    return merged;
  }

  private static async parseConfig(
    configFilePath: string,
  ): Promise<FleetConfig | null> {
    try {
      if (!(await pathExists(configFilePath))) return null;

      return fleetConfigSchema.parse(await readJSON(configFilePath));
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('\n');

        throw new Error(`Invalid config:\n${message}`);
      }
      throw error;
    }
  }

  static async createProjectConfig(
    projectRoot: string,
    config: FleetConfigInput,
  ): Promise<void> {
    const configPath = this.getProjectConfigFilePath(projectRoot);
    await writeJSON(configPath, config, { spaces: 2 });
  }

  static getProjectConfigFilePath(projectRoot: string) {
    return path.join(projectRoot, CONFIG_PATHS.project_config_filename);
  }

  static getGlobalConfigPath() {
    return CONFIG_PATHS.global_config_filepath;
  }

  static async updateGlobalConfig(
    updateFn: (config: FleetConfigInput) => FleetConfigInput,
  ): Promise<void> {
    const existingConfig =
      (await this.parseConfig(CONFIG_PATHS.global_config_filepath)) ?? {};

    const updatedConfig = updateFn(existingConfig);
    await ensureDir(path.dirname(CONFIG_PATHS.global_config_filepath));
    await writeJSON(CONFIG_PATHS.global_config_filepath, updatedConfig, {
      spaces: 2,
    });
  }
}
