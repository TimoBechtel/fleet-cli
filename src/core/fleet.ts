import chalk from 'chalk';
import { ensureDir, pathExists } from 'fs-extra';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Backend } from './backends/backend.js';
import {
  ConfigManager,
  type FleetConfig,
  type FleetConfigInput,
} from './config.js';
import { GitRepo } from './git-repo.js';
import { Workspace } from './workspace.js';

const PROJECT_CONFIG_DEFAULTS: FleetConfigInput = {};

export class FleetProject {
  public readonly root: string;
  public readonly config: FleetConfig;

  private constructor(root: string, config: FleetConfig) {
    this.root = root;
    this.config = config;
  }

  private get fleetConfigDir(): string {
    return path.join(this.root, '.fleet');
  }

  private get workspacesDir(): string {
    return path.join(this.fleetConfigDir, 'workspaces');
  }

  private static async isFleetProjectRoot(dir: string): Promise<boolean> {
    // we check for .fleet as a marker for a fleet project
    const fleetProjectMaker = path.join(dir, '.fleet');

    // if we find a workspace marker, we know we are in a workspace and not in a fleet project
    const workspaceMarker = path.join(dir, '.fleet', '.workspace');

    return (
      (await pathExists(fleetProjectMaker)) &&
      !(await pathExists(workspaceMarker))
    );
  }

  static async findFleetProject(
    startDir: string = process.cwd(),
  ): Promise<FleetProject | null> {
    let currentDir = path.resolve(startDir);

    while (currentDir !== path.dirname(currentDir)) {
      if (await FleetProject.isFleetProjectRoot(currentDir)) {
        const config = await ConfigManager.loadConfig(currentDir);
        return new FleetProject(currentDir, config);
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  static async ensureFleetProject(): Promise<FleetProject> {
    const fleet = await FleetProject.findFleetProject();
    if (!fleet) {
      console.error(chalk.red('Error: not in a Fleet project'));
      console.error(chalk.dim('Try: fleet init <name> or fleet init .'));
      process.exit(1);
    }
    return fleet;
  }

  static async init(
    root: string,
    options: { stealth?: boolean } = {},
  ): Promise<FleetProject> {
    const fleetDir = path.join(root, '.fleet');
    const workspacesDir = path.join(fleetDir, 'workspaces');

    await ensureDir(fleetDir);
    await ensureDir(workspacesDir);

    await ConfigManager.createProjectConfig(root, PROJECT_CONFIG_DEFAULTS);

    const gitignoreLines = options.stealth
      ? [
          '# Fleet stealth mode: keep .fleet/ local. To track Fleet config in git, remove the next line.',
          '*',
          '/workspaces/',
          '.workspace',
          '',
        ]
      : ['/workspaces/', '.workspace', ''];
    await writeFile(
      path.join(fleetDir, '.gitignore'),
      gitignoreLines.join('\n'),
    );

    const config = await ConfigManager.loadConfig(root);
    return new FleetProject(root, config);
  }

  async getWorkspaces(): Promise<string[]> {
    if (!(await pathExists(this.workspacesDir))) {
      return [];
    }

    const entries = await readdir(this.workspacesDir, {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  }

  buildWorkspacePath(name: string): string {
    return path.join(this.workspacesDir, name);
  }

  async createWorkspace(
    name: string,
    {
      baseBranch,
      backend,
    }: {
      baseBranch?: string;
      backend?: FleetConfig['backend'];
    } = {},
  ): Promise<Workspace> {
    const workspaceDir = this.buildWorkspacePath(name);
    if (await pathExists(workspaceDir)) {
      throw new Error(`Workspace '${name}' already exists`);
    }

    const projectRootRepo = new GitRepo(this.root);
    if (await projectRootRepo.hasUncommittedChanges()) {
      console.warn(
        chalk.yellow('Warning: project root is dirty. Ignoring dirty files.'),
      );
    }
    const dirtyExtra = await projectRootRepo.matchDirtyFiles(
      this.config.extraFiles,
    );
    if (dirtyExtra.length > 0) {
      throw new Error(
        `Cannot create workspace: The following configured extraFiles are dirty:\n  ${dirtyExtra.join('\n  ')}\nCommit or stash these changes first.`,
      );
    }

    const backendImpl = Backend.pick(backend ?? this.config.backend);

    const workspace = new Workspace({
      projectRootDir: this.root,
      workspaceDir,
      name,
      backend: backendImpl,
      config: this.config,
    });

    await workspace.provision(baseBranch);

    return workspace;
  }
}
