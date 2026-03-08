import type { FleetConfig } from '../config.js';

export abstract class Backend {
  static async detect(args: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<Backend> {
    const { WorktreeBackend } = await import('./worktree-backend.js');
    const { CloneBackend } = await import('./clone-backend.js');

    const worktreeBackend = new WorktreeBackend();
    if (await worktreeBackend.matchesWorkspaceDir(args)) {
      return worktreeBackend;
    }

    return new CloneBackend();
  }

  static create(kind: FleetConfig['backend']): Backend {
    return new LazyBackend(kind);
  }

  abstract createWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    config: FleetConfig;
    baseBranch?: string;
  }): Promise<void>;
  abstract mergeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
  }): Promise<void>;
  abstract removeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    force?: boolean;
  }): Promise<void>;
  abstract matchesWorkspaceDir(args: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<boolean>;
}

class LazyBackend extends Backend {
  private backendPromise?: Promise<Backend>;

  constructor(private readonly kind: FleetConfig['backend']) {
    super();
  }

  private async resolve(): Promise<Backend> {
    if (!this.backendPromise) {
      this.backendPromise = (async () => {
        if (this.kind === 'worktree') {
          const { WorktreeBackend } = await import('./worktree-backend.js');
          return new WorktreeBackend();
        }
        const { CloneBackend } = await import('./clone-backend.js');
        return new CloneBackend();
      })();
    }
    return this.backendPromise;
  }

  async createWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    config: FleetConfig;
    baseBranch?: string;
  }): Promise<void> {
    const backend = await this.resolve();
    await backend.createWorkspace(args);
  }

  async mergeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
  }): Promise<void> {
    const backend = await this.resolve();
    await backend.mergeWorkspace(args);
  }

  async removeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    force?: boolean;
  }): Promise<void> {
    const backend = await this.resolve();
    await backend.removeWorkspace(args);
  }

  async matchesWorkspaceDir(args: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<boolean> {
    const backend = await this.resolve();
    return backend.matchesWorkspaceDir(args);
  }
}
