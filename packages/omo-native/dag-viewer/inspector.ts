import type { DagNode, DagRunRecordV1 } from "@oh-my-opencode/senpi-task/dag"

import { deriveCounts, formatDuration, nodeElapsedMs, nodeTargetLabel, runElapsedMs } from "./run-record"
import { padVisible, sanitizeText, truncateWithEllipsis, wrapText } from "./text"
import { runStatusColor, stateColor, type Theme } from "./theme"

export type InspectorInput = {
  readonly record: DagRunRecordV1
  readonly node: DagNode | undefined
  readonly width: number
  readonly height: number
  readonly theme: Theme
  readonly now: number
}

export function renderInspector(input: InspectorInput): string[] {
  if (input.width <= 0 || input.height <= 0) return []
  const lines = input.node === undefined ? runLines(input) : nodeLines(input, input.node)
  return fit(lines, input.width, input.height)
}

function runLines(input: InspectorInput): string[] {
  const { record, theme } = input
  const counts = deriveCounts(record)
  return [
    theme.bold(theme.paint("title", "run")),
    `${theme.dim("name")}  ${sanitizeText(record.name)}`,
    `${theme.dim("id")}    ${record.runId}`,
    `${theme.dim("state")} ${theme.paint(runStatusColor(record.status), `${record.status}`)}`,
    `${theme.dim("nodes")} ${counts.completed}/${counts.total} done · ${counts.running} running`,
    `${theme.dim("time")}  ${formatDuration(runElapsedMs(record, input.now))}`,
    `${theme.dim("parent")} ${shortSession(record.parentSessionId)}`,
    "",
    theme.dim(`critical path ${record.criticalPath.length}`),
    ...wrapIndented(record.criticalPath.join(" → "), input.width, 2),
    "",
    theme.dim(`bottlenecks ${record.bottlenecks.length}`),
    ...wrapIndented(record.bottlenecks.map((item) => `${item.nodeId} (${item.blockedCount})`).join(" · "), input.width, 2),
  ]
}

function nodeLines(input: InspectorInput, node: DagNode): string[] {
  const { record, theme, width } = input
  const lines: string[] = [
    theme.bold(theme.paint("title", "node")),
    `${theme.dim("id")}     ${node.id}`,
  ]
  if (node.label !== undefined) lines.push(`${theme.dim("label")}  ${sanitizeText(node.label)}`)
  lines.push(
    `${theme.dim("state")}  ${theme.paint(stateColor(node.state), `${theme.stateGlyph(node.state)} ${node.state}`)}`,
    `${theme.dim("route")}  ${sanitizeText(nodeTargetLabel(node))}`,
    `${theme.dim("attempt")} ${node.attempt}${node.execAttempt === undefined ? "" : ` · exec ${node.execAttempt}`}`,
    `${theme.dim("elapsed")} ${formatDuration(nodeElapsedMs(node, input.now))}`,
  )
  if (node.taskId !== undefined) lines.push(`${theme.dim("task")}   ${node.taskId}`)
  if (node.lastActivityAt !== undefined) lines.push(`${theme.dim("active")} ${node.lastActivityAt}`)

  const children = record.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to)
  lines.push("", theme.dim(`depends on ${node.dependsOn.length}`), ...wrapIndented(node.dependsOn.join(" · ") || "none", width, 2))
  lines.push(theme.dim(`unblocks ${children.length}`), ...wrapIndented(children.join(" · ") || "none", width, 2))
  if (node.error !== undefined) {
    lines.push("", theme.paint("error", truncateWithEllipsis(`${node.error.code}: ${node.error.message}`, width)), ...wrapIndented(node.error.message, width, 2))
  }
  lines.push("", theme.dim("prompt"), ...wrapIndented(node.prompt, width, 4))
  if (node.output !== undefined && node.output.length > 0) {
    lines.push("", theme.dim("output"), ...wrapIndented(node.output, width, 3))
  }
  return lines
}

function wrapIndented(value: string, width: number, maxLines: number): string[] {
  return wrapText(value, Math.max(1, width - 2), maxLines).map((line) => `  ${line}`)
}

function shortSession(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function fit(lines: readonly string[], width: number, height: number): string[] {
  const result = lines.slice(0, height).map((line) => padVisible(line, width))
  while (result.length < height) result.push(" ".repeat(width))
  return result
}

export function emptyInspector(width: number, height: number, theme: Theme): string[] {
  return fit([theme.dim("select a node with j/k")], width, height)
}
