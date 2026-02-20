import path from 'node:path';
import type { FleetProject } from './fleet';

// Should we move this to FLeetProject?

/**
 * Resolve a workspace directory in a fleet project.
 *
 * @returns The workspace directory, or null if the workspace does not exist.
 */
export async function resolveWorkspaceDirectory(
  fleet: FleetProject,
  workspaceName: string,
): Promise<string | null> {
  // quick check to ignore paths
  if (
    workspaceName.includes(path.sep) ||
    workspaceName === '.' ||
    workspaceName === '..'
  ) {
    return null;
  }

  const workspaces = await fleet.getWorkspaces();

  if (workspaces.includes(workspaceName)) {
    return fleet.buildWorkspacePath(workspaceName);
  }

  return null;
}

/**
 * Get the name of the workspace for a given directory, if it is a workspace.
 * Works in sub-directories of the workspace.
 */
export async function getCurrentWorkspaceName(
  currentDir: string,
  fleet: FleetProject,
): Promise<string | null> {
  const workspaces = await fleet.getWorkspaces();
  for (const workspace of workspaces) {
    const workspaceDir = fleet.buildWorkspacePath(workspace);
    if (
      currentDir === workspaceDir ||
      currentDir.startsWith(workspaceDir + path.sep)
    ) {
      return workspace;
    }
  }
  return null;
}
