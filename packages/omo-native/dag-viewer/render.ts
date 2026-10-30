import type { DagNode, DagNodeId, DagRunEvent, DagRunRecordV1 } from "@oh-my-opencode/senpi-task/dag"

import { renderFeed } from "./feed"
import { renderGraph } from "./graph"
import { renderInspector } from "./inspector"
import type { ViewerRun } from "./paths"
import { deriveCounts, formatDuration, runElapsedMs } from "./run-record"
import { padVisible, sanitizeText, truncateWithEllipsis, visibleWidth } from "./text"
import { runStatusColor, type Theme } from "./theme"

export type RenderOptions = {
  readonly runs: readonly ViewerRun[]
  readonly runIndex: number
  readonly record: DagRunRecordV1 | undefined
  readonly events: readonly DagRunEvent[]
  readonly selectedNodeId: DagNodeId | undefined
  readonly width: number
  readonly height: number
  readonly theme: Theme
  readonly paused: boolean
  readonly follow: boolean
  readonly showAll: boolean
  readonly help: boolean
  readonly tree: boolean
  readonly notice: string | undefined
  readonly error: string | undefined
  readonly frame: number
  readonly now: number
}

export function renderFrame(options: RenderOptions): string[] {
  const width = Math.max(20, options.width)
  const height = Math.max(6, options.height)
  const { theme } = options
  if (options.record === undefined) return renderEmpty({ ...options, width, height })
  if (options.help) return renderHelp({ ...options, width, height })

  const record = options.record
  const header: string[] = []
  const counts = deriveCounts(record)
  const selected = records(options, record)
  const title = theme.bold(theme.paint("title", `omo dag watch · ${sanitizeText(record.name)}`))
  const statusText = `${theme.runGlyph(record.status)} ${record.status} · ${counts.completed + counts.skipped}/${counts.total} done · ${counts.running} running · ${formatDuration(runElapsedMs(record, options.now))}`
  const status = theme.paint(runStatusColor(record.status), statusText)
  const gap = Math.max(1, width - visibleWidth(title) - visibleWidth(status))
  header.push(visibleWidth(title) + visibleWidth(status) + 1 <= width ? `${title}${" ".repeat(gap)}${status}` : truncateWithEllipsis(statusText, width))
  if (options.runs.length > 1 || options.showAll) {
    header.push(renderRunBar(options.runs, options.runIndex, width, theme))
  } else {
    header.push(theme.dim(truncateWithEllipsis(`run ${record.runId} · ${record.nodes.length} nodes · ${record.edges.length} edges`, width)))
  }
  if (options.notice !== undefined) header.push(theme.paint("accent", truncateWithEllipsis(options.notice, width)))
  if (options.error !== undefined) header.push(theme.paint("error", truncateWithEllipsis(options.error, width)))

  const footer = renderFooter(width, options, theme)
  const available = height - header.length - 1
  const feedHeight = available >= 14 ? clamp(Math.floor(height * 0.2), 4, 7) : 0
  const bodyHeight = Math.max(1, available - feedHeight)
  const sideWidth = width >= 92 ? clamp(Math.floor(width * 0.34), 28, 46) : 0
  const inspectorHeight = sideWidth === 0 && bodyHeight >= 14 ? clamp(Math.floor(bodyHeight * 0.32), 6, 10) : 0
  const graphWidth = sideWidth > 0 ? width - sideWidth - 1 : width
  const graphHeight = Math.max(1, bodyHeight - inspectorHeight)

  const graph = renderGraph(record, {
    width: graphWidth,
    height: graphHeight,
    selectedNodeId: selected?.id,
    theme,
    frame: options.frame,
    tree: options.tree,
    now: options.now,
  })
  let body: string[]
  if (sideWidth > 0) {
    const inspector = renderInspector({
      record,
      node: selected,
      width: sideWidth,
      height: graphHeight,
      theme,
      now: options.now,
    })
    body = graph.map((line, index) => `${padVisible(line, graphWidth)} ${inspector[index] ?? " ".repeat(sideWidth)}`)
  } else if (inspectorHeight > 0) {
    const inspector = renderInspector({ record, node: selected, width, height: inspectorHeight, theme, now: options.now })
    body = [...graph, ...inspector]
  } else {
    body = graph
  }

  const feed = feedHeight > 0 ? renderFeed(options.events, width, feedHeight, theme) : []
  return [...header, ...body, ...feed, footer].slice(0, height).map((line) => padVisible(line, width))
}

function records(options: RenderOptions, record: DagRunRecordV1): DagNode | undefined {
  if (options.selectedNodeId !== undefined) {
    const direct = record.nodes.find((node) => node.id === options.selectedNodeId)
    if (direct !== undefined) return direct
  }
  return record.nodes.find((node) => node.state === "running")
    ?? record.nodes.find((node) => node.state === "failed")
    ?? record.nodes[0]
}

function renderRunBar(runs: readonly ViewerRun[], runIndex: number, width: number, theme: Theme): string {
  const maxChips = clamp(Math.floor(width / 24), 2, 6)
  const start = clamp(runIndex - Math.floor(maxChips / 2), 0, Math.max(0, runs.length - maxChips))
  const visible = runs.slice(start, start + maxChips)
  const measured = visible.map((run, offset) => {
    const index = start + offset
    const label = `${run.projectLabel === "" ? "" : `${run.projectLabel}/`}${run.name}`
    return {
      index,
      plain: `[${index + 1}] ${theme.runGlyph(run.status)} ${truncateWithEllipsis(label, 18)} ${run.counts.completed + run.counts.skipped}/${run.counts.total}`,
    }
  })
  const suffixPlain = start + visible.length < runs.length ? ` +${runs.length - start - visible.length}` : ""
  let chips = measured
  while (chips.length > 0 && visibleWidth(`${chips.map((chip) => chip.plain).join("  ")}${suffixPlain}`) > width) {
    chips = chips.slice(0, -1)
  }
  if (chips.length === 0) return ""
  const painted = chips.map((chip) => (chip.index === runIndex ? theme.inverse(chip.plain) : theme.dim(chip.plain)))
  const suffix = start + visible.length < runs.length ? theme.dim(suffixPlain) : ""
  return `${painted.join("  ")}${suffix}`
}

function renderFooter(width: number, options: RenderOptions, theme: Theme): string {
  const state = [
    options.paused ? "PAUSED" : undefined,
    options.follow ? "FOLLOW" : undefined,
    options.tree ? "TREE" : undefined,
    options.showAll ? "ALL PROJECTS" : undefined,
  ].filter((entry): entry is string => entry !== undefined)
  const keys = "q quit  j/k node  [ ] run  f follow  p pause  a all  t tree  ? help"
  const plainSuffix = state.length === 0 ? "" : ` · ${state.join(" · ")}`
  if (visibleWidth(keys + plainSuffix) > width) return theme.dim(truncateWithEllipsis(keys + plainSuffix, width))
  const paintedState = state.map((entry) => theme.paint(entry === "PAUSED" ? "warn" : "accent", entry)).join(" · ")
  return `${theme.dim(keys)}${state.length === 0 ? "" : ` · ${paintedState}`}`
}

function renderEmpty(options: RenderOptions & { readonly width: number; readonly height: number }): string[] {
  const { theme, width, height } = options
  const lines = [theme.bold(theme.paint("title", "omo dag watch")), ""]
  const message = options.error ?? "no DAG runs found"
  lines.push(theme.paint(options.error === undefined ? "warn" : "error", truncateWithEllipsis(message, width)))
  lines.push(theme.dim(truncateWithEllipsis("Run a DAG from a mass ulw session, then press r.", width)))
  if (options.notice !== undefined) lines.push(theme.paint("accent", truncateWithEllipsis(options.notice, width)))
  while (lines.length < height - 1) lines.push("")
  lines.push(renderFooter(width, options, theme))
  return lines.slice(0, height).map((line) => padVisible(line, width))
}

function renderHelp(options: RenderOptions & { readonly width: number; readonly height: number }): string[] {
  const { theme, width, height } = options
  const rows: readonly (readonly [string, string])[] = [
    ["q, esc", "quit"],
    ["j/k, up/down", "move between nodes"],
    ["h/l, left/right", "move a layer at a time"],
    ["[ ]", "previous / next run"],
    ["f", "toggle follow (latest run)"],
    ["p", "pause / resume refresh"],
    ["a", "toggle all projects"],
    ["t", "toggle graph / tree"],
    ["r", "reload now"],
    ["?", "close this help"],
  ]
  const lines = [theme.bold(theme.paint("title", "keys")), ""]
  for (const [key, description] of rows) {
    const plain = `${key.padEnd(18)}${description}`
    lines.push(truncateWithEllipsis(plain, width) === plain ? `${theme.paint("accent", key.padEnd(18))}${theme.dim(description)}` : theme.dim(truncateWithEllipsis(plain, width)))
  }
  lines.push("", theme.dim("The viewer is read-only: it never starts, stops, or edits a run."))
  while (lines.length < height - 1) lines.push("")
  lines.push(renderFooter(width, options, theme))
  return lines.slice(0, height).map((line) => padVisible(line, width))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
