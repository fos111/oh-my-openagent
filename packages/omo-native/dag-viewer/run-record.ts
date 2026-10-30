import { readFileSync } from "node:fs"

import {
  DAG_NODE_STATES,
  type DagNode,
  type DagNodeCounts,
  type DagNodeState,
  type DagRunStatus,
  type DagRunRecordV1,
} from "@oh-my-opencode/senpi-task/dag"

export type RunRecordRead = { readonly record: DagRunRecordV1 } | { readonly error: string }

const NODE_STATES: ReadonlySet<string> = new Set(DAG_NODE_STATES)
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set(["completed", "failed", "cancelled"])

export function isDagRunRecord(value: unknown): value is DagRunRecordV1 {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === 1
    && typeof record.runId === "string"
    && typeof record.name === "string"
    && typeof record.status === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string"
    && Array.isArray(record.nodes)
    && Array.isArray(record.edges)
    && record.nodes.every(isDagNode)
  )
}

function isDagNode(value: unknown): value is DagNode {
  if (typeof value !== "object" || value === null) return false
  const node = value as Record<string, unknown>
  return (
    typeof node.id === "string"
    && typeof node.prompt === "string"
    && typeof node.state === "string"
    && NODE_STATES.has(node.state)
    && Array.isArray(node.dependsOn)
    && node.dependsOn.every((dependency) => typeof dependency === "string")
  )
}

export function readRunRecord(path: string): RunRecordRead {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (error) {
    return { error: `run checkpoint is not readable: ${error instanceof Error ? error.message : String(error)}` }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isDagRunRecord(parsed)) return { error: "run checkpoint does not match the DAG run record schema" }
    return { record: parsed }
  } catch (error) {
    return { error: `run checkpoint is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export function deriveCounts(record: Pick<DagRunRecordV1, "nodes">): DagNodeCounts {
  const counts: Record<DagNodeState, number> = {
    pending: 0,
    blocked: 0,
    scheduled: 0,
    running: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  }
  for (const node of record.nodes) counts[node.state] += 1
  return {
    total: record.nodes.length,
    pending: counts.pending,
    blocked: counts.blocked,
    scheduled: counts.scheduled,
    running: counts.running,
    paused: counts.paused,
    completed: counts.completed,
    failed: counts.failed,
    cancelled: counts.cancelled,
    skipped: counts.skipped,
  }
}

export function isTerminalRunStatus(status: DagRunStatus | string): boolean {
  return TERMINAL_RUN_STATUSES.has(status)
}

export function runElapsedMs(record: Pick<DagRunRecordV1, "status" | "createdAt" | "updatedAt" | "startedAt" | "completedAt">, now = Date.now()): number {
  const start = Date.parse(record.startedAt ?? record.createdAt)
  if (Number.isNaN(start)) return 0
  const finished = record.completedAt !== undefined && isTerminalRunStatus(record.status)
    ? Date.parse(record.completedAt)
    : isTerminalRunStatus(record.status)
      ? Date.parse(record.updatedAt)
      : now
  if (Number.isNaN(finished)) return 0
  return Math.max(0, finished - start)
}

export function nodeElapsedMs(node: Pick<DagNode, "state" | "startedAt" | "completedAt" | "createdAt">, now = Date.now()): number {
  const start = Date.parse(node.startedAt ?? node.createdAt)
  if (Number.isNaN(start)) return 0
  const finished = node.completedAt !== undefined
    ? Date.parse(node.completedAt)
    : isTerminalNodeState(node.state)
      ? start
      : now
  if (Number.isNaN(finished)) return 0
  return Math.max(0, finished - start)
}

export function isTerminalNodeState(state: DagNodeState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled" || state === "skipped"
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
}

export function nodeTargetLabel(node: Pick<DagNode, "route">): string {
  return node.route.kind === "category" ? node.route.category : node.route.agent
}
