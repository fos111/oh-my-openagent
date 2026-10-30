import { existsSync, readdirSync, statSync, type Dirent } from "node:fs"
import { basename, isAbsolute, join, resolve } from "node:path"
import { homedir } from "node:os"

import { dagDirectoryPaths, resolveDagStateDirectory, type DagNodeCounts, type DagRunStatus } from "@oh-my-opencode/senpi-task/dag"
import { resolveAgentHome } from "@oh-my-opencode/senpi-task/agent-home"

import { deriveCounts, readRunRecord } from "./run-record"

export type ViewerRoot = {
  readonly root: string
  readonly label: string
}

export type ViewerRun = {
  readonly runId: string
  readonly name: string
  readonly status: DagRunStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly counts: DagNodeCounts
  readonly root: string
  readonly projectLabel: string
  readonly filePath: string
  readonly eventPath: string
}

export type ViewerRunList = {
  readonly runs: readonly ViewerRun[]
  readonly errors: readonly string[]
}

export type ResolveViewerRootsOptions = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly homeDir?: string
  readonly projectDir?: string
  readonly stateDir?: string
  readonly allProjects?: boolean
}

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export function resolveViewerRoots(options: ResolveViewerRootsOptions): ViewerRoot[] {
  const homeDir = options.homeDir ?? homedir()
  if (options.stateDir !== undefined) {
    const root = absolutePath(options.stateDir, options.cwd)
    return [{ root, label: `state ${basename(root)}` }]
  }
  const projectDir = absolutePath(options.projectDir ?? options.cwd, options.cwd)
  const projectRoot: ViewerRoot = {
    root: resolveDagStateDirectory(projectDir, { env: options.env }),
    label: `${basename(projectDir)} (project)`,
  }
  if (options.allProjects !== true) return [projectRoot]

  const roots: ViewerRoot[] = []
  const agentHome = resolveAgentHome({ env: options.env, homeDir })
  const projectsDir = join(agentHome, "projects")
  let entries: Dirent[] = []
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true })
  } catch {
    entries = []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const root = join(projectsDir, entry.name, "senpi-task", "dag")
    if (!existsSync(root)) continue
    roots.push({ root, label: entry.name.replace(/-[0-9a-f]{12}$/u, "") })
  }
  if (existsSync(projectRoot.root) && !roots.some((candidate) => candidate.root === projectRoot.root)) {
    roots.push(projectRoot)
  }
  if (roots.length === 0) roots.push(projectRoot)
  return roots
}

function absolutePath(value: string, cwd: string): string {
  return isAbsolute(value) ? value : resolve(cwd, value)
}

export function runIdFromFileName(fileName: string): string | undefined {
  if (!fileName.endsWith(".json")) return undefined
  const runId = fileName.slice(0, -".json".length)
  return RUN_ID_PATTERN.test(runId) ? runId : undefined
}

export function isSafeRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value) && value !== "." && value !== ".."
}

export function listViewerRuns(roots: readonly ViewerRoot[]): ViewerRunList {
  const runs: ViewerRun[] = []
  const errors: string[] = []
  for (const { root, label } of roots) {
    const paths = dagDirectoryPaths(root)
    let files: string[]
    try {
      files = readdirSync(paths.runs)
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    for (const file of files) {
      const runId = runIdFromFileName(file)
      if (runId === undefined) continue
      const filePath = join(paths.runs, file)
      const read = readRunRecord(filePath)
      if ("error" in read) {
        errors.push(`${label}/${file}: ${read.error}`)
        continue
      }
      const record = read.record
      runs.push({
        runId: record.runId,
        name: record.name,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        counts: deriveCounts(record),
        root,
        projectLabel: label,
        filePath,
        eventPath: join(paths.events, `${record.runId}.jsonl`),
      })
    }
  }
  runs.sort((left, right) => {
    const byUpdated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    if (Number.isFinite(byUpdated) && byUpdated !== 0) return byUpdated
    return left.runId.localeCompare(right.runId)
  })
  return { runs, errors }
}

export function selectRunIndex(runs: readonly ViewerRun[], selector: string | undefined): number {
  if (runs.length === 0) return -1
  if (selector === undefined) return 0
  const lowered = selector.toLowerCase()
  const exact = runs.findIndex((run) => run.runId === selector)
  if (exact >= 0) return exact
  const byName = runs.findIndex((run) => run.name.toLowerCase() === lowered)
  if (byName >= 0) return byName
  const byPrefix = runs.findIndex((run) => run.runId.startsWith(selector))
  if (byPrefix >= 0) return byPrefix
  const byNamePrefix = runs.findIndex((run) => run.name.toLowerCase().startsWith(lowered))
  return byNamePrefix
}

export function runFileMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

export function requireProjectRoot(roots: readonly ViewerRoot[]): ViewerRoot {
  const first = roots[0]
  if (first === undefined) throw new Error("no DAG state directory resolved for this project")
  return first
}
