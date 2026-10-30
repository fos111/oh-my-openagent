import { join } from "node:path"

import { resolveProjectStateDirectory, type ProjectStateDirectoryOptions } from "../store/project-state-directory"

/** Read-only view of the DAG store location resolution: the viewer must never adopt a legacy
 * in-project store, so the default `markAdopted` is a no-op instead of writing the marker. */
export type DagLocationOptions = ProjectStateDirectoryOptions

/**
 * Resolve a project's DAG run root (`<stateDir>/dag`) without touching the project. The engine's
 * resolver is the single source of truth for the project key, the agent-dir env precedence, and
 * legacy in-project stores; this helper only pins the state name and keeps adoption read-only.
 */
export function resolveDagStateDirectory(projectDir: string, options: DagLocationOptions = {}): string {
  const stateDir = resolveProjectStateDirectory(projectDir, "senpi-task", {
    ...options,
    markAdopted: options.markAdopted ?? (() => {}),
  })
  return join(stateDir, "dag")
}

export type DagDirectoryPaths = {
  readonly root: string
  readonly runs: string
  readonly events: string
}

export function dagDirectoryPaths(root: string): DagDirectoryPaths {
  return {
    root,
    runs: join(root, "runs"),
    events: join(root, "events"),
  }
}
