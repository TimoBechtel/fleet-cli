import type { FleetConfig } from '../config.js';
import { CloneBackend } from './clone-backend.js';
import { WorktreeBackend } from './worktree-backend.js';

export interface Backend {
  createWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    config: FleetConfig;
    baseBranch?: string;
  }): Promise<void>;
  mergeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
  }): Promise<void>;
  removeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    force?: boolean;
  }): Promise<void>;
  matchesWorkspaceDir(args: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<boolean>;
}

export function createBackend(kind: FleetConfig['backend']): Backend {
  return kind === 'worktree' ? new WorktreeBackend() : new CloneBackend();
}

export class BackendResolver {
  static async detect(args: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<Backend> {
    const worktreeBackend = new WorktreeBackend();
    if (await worktreeBackend.matchesWorkspaceDir(args)) {
      return worktreeBackend;
    }
    return new CloneBackend();
  }

  static create(kind: FleetConfig['backend']): Backend {
    return createBackend(kind);
  }
}

export const Backend = BackendResolver;
