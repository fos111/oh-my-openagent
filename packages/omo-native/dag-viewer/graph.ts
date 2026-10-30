import type { DagNode, DagNodeId, DagRunRecordV1 } from "@oh-my-opencode/senpi-task/dag"

import { ASCII_BOX, Canvas, UNICODE_BOX, type CanvasStyle } from "./canvas"
import { layoutDag } from "./layout"
import { displayWidth, padVisible, sanitizeText, truncateText, truncateWithEllipsis } from "./text"
import { formatDuration, nodeElapsedMs, nodeTargetLabel } from "./run-record"
import { stateColor, type Theme } from "./theme"

export type GraphOptions = {
  readonly width: number
  readonly height: number
  readonly selectedNodeId: DagNodeId | undefined
  readonly theme: Theme
  readonly frame: number
  readonly tree: boolean
  readonly now: number
}

const BOX_HEIGHT = 4
const ROW_STRIDE = 5

export function renderGraph(record: DagRunRecordV1, options: GraphOptions): string[] {
  if (options.height <= 0 || options.width <= 0) return []
  if (options.tree || options.width < 56 || options.height < 9) {
    return renderTree(record, options)
  }
  return renderLayered(record, options)
}

function renderLayered(record: DagRunRecordV1, options: GraphOptions): string[] {
  const { theme, width, height, selectedNodeId, frame } = options
  const layout = layoutDag(record)
  if (layout.positioned.length === 0) return fit([theme.dim("(no nodes)")], width, height)

  const labelWidth = Math.max(
    ...layout.positioned.map((positioned) => displayWidth(sanitizeText(positioned.node.label ?? positioned.node.id))),
  )
  const boxWidth = clamp(labelWidth + 4, 14, 28)
  const maxLanes = Math.max(1, ...layout.edges.map((edge) => edge.laneCount))
  const gutter = clamp(maxLanes + 2, 3, 9)
  const selected = selectedNodeId === undefined ? undefined : layout.byId.get(selectedNodeId)
  const scrollX = selected === undefined
    ? 0
    : Math.max(0, selected.layer * (boxWidth + gutter) - Math.floor(width / 3))
  const scrollY = selected === undefined
    ? 0
    : Math.max(0, selected.row * ROW_STRIDE - Math.floor((height - 2) / 2) + 1)
  const boxX = (layer: number): number => layer * (boxWidth + gutter) - scrollX
  const boxY = (row: number): number => 1 + row * ROW_STRIDE - scrollY
  const canvas = new Canvas(width, height)
  const chars = theme.ascii ? ASCII_BOX : UNICODE_BOX

  for (const edge of layout.edges) {
    const from = layout.byId.get(edge.from)
    const to = layout.byId.get(edge.to)
    if (from === undefined || to === undefined) continue
    if (edge.toLayer <= edge.fromLayer) continue
    const fromX = boxX(from.layer) + boxWidth
    const toX = boxX(to.layer)
    const y1 = boxY(from.row) + 1
    const y2 = boxY(to.row) + 1
    const critical = layout.critical.has(edge.from) && layout.critical.has(edge.to)
    const style: CanvasStyle = critical ? { color: "warn" } : { color: "muted", dim: true }
    if (edge.toLayer === edge.fromLayer + 1) {
      const laneX = fromX + 1 + (edge.lane % Math.max(1, gutter - 2))
      drawElbow(canvas, fromX, toX, laneX, y1, y2, style, theme)
      continue
    }
    const dashed = theme.ascii ? "." : "·"
    const vertical = theme.ascii ? "|" : "│"
    const arrow = theme.ascii ? ">" : "▶"
    for (let x = Math.max(0, fromX + 1); x < toX - 1; x += 1) canvas.set(x, y1, dashed, style)
    if (y2 > y1) {
      for (let y = y1 + 1; y < y2; y += 1) canvas.set(toX - 1, y, vertical, style)
    } else if (y2 < y1) {
      for (let y = y2 + 1; y < y1; y += 1) canvas.set(toX - 1, y, vertical, style)
    }
    canvas.set(toX - 1, y2, arrow, style)
  }

  for (const positioned of layout.positioned) {
    const { node } = positioned
    const x = boxX(positioned.layer)
    const y = boxY(positioned.row)
    const isSelected = selectedNodeId === node.id
    const borderStyle: CanvasStyle = isSelected
      ? { color: "accent", bold: true, inverse: true }
      : { color: stateColor(node.state), dim: !layout.critical.has(node.id) }
    canvas.box(x, y, boxWidth, BOX_HEIGHT, borderStyle, chars)
    const glyph = node.state === "running" ? theme.spinner(frame) : theme.stateGlyph(node.state)
    const label = sanitizeText(node.label ?? node.id)
    const title = truncateText(`${glyph} ${label}`, Math.max(0, boxWidth - 4))
    canvas.text(x + 2, y + 1, title, {
      color: stateColor(node.state),
      bold: isSelected || layout.critical.has(node.id),
      inverse: isSelected,
    })
    const bottleneck = layout.bottlenecks.get(node.id)
    const meta = `${node.id}${node.attempt > 1 ? ` #${node.attempt}` : ""}${bottleneck === undefined ? "" : ` ${theme.ascii ? "^" : "▲"}${bottleneck}`}`
    canvas.text(x + 2, y + 2, truncateText(meta, Math.max(0, boxWidth - 4)), isSelected ? { inverse: true } : { dim: true })
  }

  const title = `graph · ${layout.layerCount} layers · ${layout.positioned.length} nodes${layout.longEdgeCount === 0 ? "" : ` · ${layout.longEdgeCount} long`}`
  const lines = canvas.toLines((text, style) => paintStyle(theme, text, style))
  lines[0] = padVisible(theme.dim(truncateWithEllipsis(title, width)), width)
  return fit(lines, width, height)
}

function drawElbow(
  canvas: Canvas,
  fromX: number,
  toX: number,
  laneX: number,
  y1: number,
  y2: number,
  style: CanvasStyle,
  theme: Theme,
): void {
  const arrow = theme.ascii ? ">" : "▶"
  const horizontal = theme.ascii ? "-" : "─"
  const vertical = theme.ascii ? "|" : "│"
  if (y2 === y1) {
    for (let x = Math.max(0, fromX + 1); x < toX - 1; x += 1) canvas.set(x, y1, horizontal, style)
    canvas.set(toX - 1, y1, arrow, style)
    return
  }
  for (let x = Math.max(0, fromX + 1); x <= laneX; x += 1) canvas.set(x, y1, horizontal, style)
  if (y2 > y1) {
    canvas.set(laneX, y1, "└", style)
    for (let y = y1 + 1; y < y2; y += 1) canvas.set(laneX, y, vertical, style)
    canvas.set(laneX, y2, "┐", style)
  } else {
    canvas.set(laneX, y1, "┌", style)
    for (let y = y2 + 1; y < y1; y += 1) canvas.set(laneX, y, vertical, style)
    canvas.set(laneX, y2, "┘", style)
  }
  for (let x = laneX + 1; x < toX - 1; x += 1) canvas.set(x, y2, horizontal, style)
  canvas.set(toX - 1, y2, arrow, style)
}

function renderTree(record: DagRunRecordV1, options: GraphOptions): string[] {
  const { theme, width, height, selectedNodeId, now } = options
  const byId = new Map<DagNodeId, DagNode>(record.nodes.map((node) => [node.id, node]))
  const children = new Map<DagNodeId, DagNodeId[]>()
  for (const node of record.nodes) children.set(node.id, [])
  for (const edge of record.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue
    children.get(edge.from)?.push(edge.to)
  }
  const roots = record.nodes.filter((node) => node.dependsOn.every((dependency) => !byId.has(dependency)))
  const visited = new Set<string>()
  const output: string[] = [theme.dim(truncateWithEllipsis(`tree · ${record.nodes.length} nodes`, width))]
  const emit = (node: DagNode, depth: number, prefix: string): void => {
    if (output.length >= height) return
    if (visited.has(node.id)) {
      output.push(padVisible(theme.dim(`${"  ".repeat(depth)}${prefix} ↺ ${node.id}`), width))
      return
    }
    visited.add(node.id)
    const glyph = node.state === "running" ? theme.spinner(options.frame) : theme.stateGlyph(node.state)
    const elapsed = node.startedAt === undefined ? "" : ` · ${formatDuration(nodeElapsedMs(node, now))}`
    const plain = truncateText(
      `${"  ".repeat(depth)}${prefix} ${glyph} ${sanitizeText(node.label ?? node.id)} · ${node.state} · ${nodeTargetLabel(node)}${elapsed}`,
      width,
    )
    const painted = node.id === selectedNodeId
      ? theme.inverse(theme.paint(stateColor(node.state), plain))
      : theme.paint(stateColor(node.state), plain)
    output.push(padVisible(painted, width))
    for (const [index, childId] of (children.get(node.id) ?? []).entries()) {
      const child = byId.get(childId)
      if (child === undefined) continue
      emit(child, depth + 1, index === (children.get(node.id)?.length ?? 1) - 1 ? "└─" : "├─")
    }
  }
  for (const root of roots) {
    if (output.length >= height) break
    emit(root, 0, roots.indexOf(root) === roots.length - 1 ? "└─" : "├─")
  }
  for (const node of record.nodes) {
    if (output.length >= height) break
    if (!visited.has(node.id)) emit(node, 0, "├─")
  }
  if (output.length >= height && record.nodes.length > 0) {
    output[height - 1] = padVisible(theme.dim("..."), width)
  }
  return fit(output, width, height)
}

function paintStyle(theme: Theme, text: string, style: CanvasStyle | undefined): string {
  if (style === undefined) return text
  let result = text
  if (style.color !== undefined) result = theme.paint(style.color, result)
  if (style.dim === true) result = theme.dim(result)
  if (style.bold === true) result = theme.bold(result)
  if (style.inverse === true) result = theme.inverse(result)
  return result
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function fit(lines: readonly string[], width: number, height: number): string[] {
  const result = lines.slice(0, height).map((line) => padVisible(line, width))
  while (result.length < height) result.push(" ".repeat(width))
  return result
}
