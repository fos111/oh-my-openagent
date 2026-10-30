import type { DagRunEvent, DagNodeState } from "@oh-my-opencode/senpi-task/dag"

import { eventClock } from "./event-tail"
import { sanitizeText, truncateWithEllipsis } from "./text"
import type { Theme, ThemeColor } from "./theme"

export type FeedEntry = {
  readonly clock: string
  readonly text: string
  readonly color: ThemeColor
}

export function describeEvent(event: DagRunEvent): { text: string; color: ThemeColor } {
  switch (event.type) {
    case "dag.run.created":
      return { text: `run created · ${event.nodeCount} nodes, ${event.edgeCount} edges`, color: "accent" }
    case "dag.run.started":
      return { text: `run started · generation ${event.generation}`, color: "accent" }
    case "dag.run.paused":
      return { text: `run paused${event.reason === undefined ? "" : ` · ${event.reason}`}`, color: "warn" }
    case "dag.run.resumed":
      return { text: `run resumed · generation ${event.generation}`, color: "accent" }
    case "dag.run.completed":
      return { text: `run completed · ${completedCount(event.counts)}/${event.counts.total}`, color: "ok" }
    case "dag.run.failed":
      return { text: `run failed · ${event.error.code}: ${event.error.message}`, color: "error" }
    case "dag.run.cancelled":
      return { text: `run cancelled${event.reason === undefined ? "" : ` · ${event.reason}`}`, color: "error" }
    case "dag.wave.started":
      return { text: `wave ${event.waveIndex} started · ${event.nodeIds.length} nodes`, color: "muted" }
    case "dag.wave.completed":
      return { text: `wave ${event.waveIndex} completed · ${event.nodeIds.length} nodes`, color: "muted" }
    case "dag.node.transitioned":
      return {
        text: `${event.nodeId} ${event.from}→${event.to}${reasonSuffix(event.reason)}`,
        color: stateColorOrMuted(event.to),
      }
    case "dag.node.task-attached":
      return { text: `${event.nodeId} task ${shortId(event.taskId)} · attempt ${event.attempt}`, color: "running" }
    case "dag.node.reused":
      return { text: `${event.nodeId} reused task ${shortId(event.taskId)}`, color: "muted" }
    case "dag.node.retried":
      return {
        text: `${event.nodeId} retry #${event.execAttempt}${event.promptChanged ? " · prompt changed" : ""}`,
        color: "warn",
      }
    case "dag.node.steered":
      return { text: `${event.nodeId} ${event.delivery} · task ${shortId(event.taskId)}`, color: "accent" }
    case "dag.definition.amended":
      return {
        text: `definition amended · +${event.addedNodeIds.length} nodes · ${event.changedNodeIds.length} changed`,
        color: "warn",
      }
    case "dag.diagnostic.added":
      return { text: `diagnostic ${event.diagnostic.kind} · ${"nodeId" in event.diagnostic ? event.diagnostic.nodeId : "run"} · ${event.diagnostic.message}`, color: "warn" }
    case "dag.stream.overflow":
      return { text: `event stream overflow · ${event.droppedCount} dropped`, color: "error" }
    case "dag.guidance.added":
    case "dag.guidance.edited":
    case "dag.guidance.removed":
    case "dag.guidance.dispatching":
    case "dag.guidance.delivered": {
      const scope = event.guidance.scope.kind === "node" ? event.guidance.scope.nodeId : "run"
      return { text: `guidance ${event.type.slice("dag.guidance.".length)} · ${scope} · ${event.guidance.id}`, color: "accent" }
    }
    case "dag.node.cancel_requested":
      return { text: `${event.nodeId} cancel requested`, color: "warn" }
    case "dag.node.retry-staged":
      return { text: `retry staged · ${event.nodeIds.length} nodes`, color: "warn" }
    case "dag.node.pause-recovered":
      return { text: `${event.nodeId} pause recovered · seq ${event.childSeq}`, color: "warn" }
    case "dag.node.pause-lost":
      return { text: `${event.nodeId} pause lost · ${event.error.code}`, color: "error" }
    default:
      return { text: (event as { type: string }).type, color: "muted" }
  }
}

function completedCount(counts: { completed: number; skipped: number }): number {
  return counts.completed + counts.skipped
}

function reasonSuffix(reason: { kind: string; queuePosition?: number; residents?: number }): string {
  if (reason.kind === "task_queued" && reason.queuePosition !== undefined) return ` (queued #${reason.queuePosition})`
  if (reason.kind === "residency_queued" && reason.residents !== undefined) return ` (residency ${reason.residents})`
  return ` (${reason.kind})`
}

function shortId(value: string): string {
  return value.length > 12 ? value.slice(0, 8) : value
}

function stateColorOrMuted(state: DagNodeState): ThemeColor {
  return state
}

export function renderFeed(events: readonly DagRunEvent[], width: number, height: number, theme: Theme): string[] {
  if (height <= 0) return []
  const lines: string[] = []
  const title = `events${events.length === 0 ? "" : ` · ${events.length}`}`
  lines.push(theme.dim(truncateWithEllipsis(title, width)))
  const visible = events.slice(-(height - 1))
  if (visible.length === 0) {
    if (height > 1) lines.push(theme.dim("no events yet"))
    while (lines.length < height) lines.push("")
    return lines
  }
  for (const event of visible) {
    const described = describeEvent(event)
    const entry = `${eventClock(event.at)} ${sanitizeText(described.text)}`
    lines.push(theme.paint(described.color, truncateWithEllipsis(entry, width)))
  }
  while (lines.length < height) lines.push("")
  return lines.slice(0, height)
}
