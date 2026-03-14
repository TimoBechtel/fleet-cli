import type { FleetConfig } from '../config';
import { CloneBackend } from './clone-backend';
import { WorktreeBackend } from './worktree-backend';

/**
 * Available backends. Ordered by priority.
 */
const registry = {
  worktree: new WorktreeBackend(),
  clone: new CloneBackend(),
} as const satisfies Record<FleetConfig['backend'], Backend>;

export interface Backend {
  /**
   * Merges a workspace directory into the project root and deletes the workspace directory.
   */
  createWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
    baseBranch?: string;
  }): Promise<void>;
  /**
   * Merges the workspace into the project root.
   */
  mergeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    name: string;
  }): Promise<void>;
  removeWorkspace(args: {
    projectRootDir: string;
    workspaceDir: string;
    force?: boolean;
  }): Promise<void>;
  matches(detectionInput: {
    projectRootDir: string;
    workspaceDir: string;
  }): Promise<boolean> | boolean;
}

async function detect(args: {
  projectRootDir: string;
  workspaceDir: string;
}): Promise<Backend> {
  const backends = Object.values(registry);
  for (const backend of backends) {
    if (await backend.matches(args)) {
      return backend;
    }
  }
  throw new Error('No backend found for workspace directory');
}

function pick(kind: FleetConfig['backend']): Backend {
  return registry[kind];
}

export const Backend = {
  detect,
  pick,
};
