import type { FleetConfig } from '../config.js';
import { CloneBackend } from './clone-backend.js';
import { WorktreeBackend } from './worktree-backend.js';

export type Backend = {
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
};

async function detect(args: {
  projectRootDir: string;
  workspaceDir: string;
}): Promise<Backend> {
  // Detection by reality (mixed-mode safe). Worktree details stay inside WorktreeBackend.
  const worktreeBackend = new WorktreeBackend();
  if (await worktreeBackend.matchesWorkspaceDir(args)) {
    return worktreeBackend;
  }

  return new CloneBackend();
}

function create(kind: FleetConfig['backend']): Backend {
  return kind === 'worktree' ? new WorktreeBackend() : new CloneBackend();
}

export const Backend = {
  detect,
  create,
};
