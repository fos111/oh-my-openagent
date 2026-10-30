import type { DagNode, DagNodeId, DagRunEvent, DagRunRecordV1 } from "@oh-my-opencode/senpi-task/dag"

import type { ViewerKey } from "./input"
import { layoutDag } from "./layout"
import type { ViewerRun } from "./paths"

export type ViewerState = {
  readonly runs: readonly ViewerRun[]
  readonly runIndex: number
  readonly record: DagRunRecordV1 | undefined
  readonly events: readonly DagRunEvent[]
  readonly selectedNodeId: DagNodeId | undefined
  readonly follow: boolean
  readonly paused: boolean
  readonly showAll: boolean
  readonly help: boolean
  readonly tree: boolean
  readonly notice: string | undefined
  readonly error: string | undefined
  readonly frame: number
}

export type ViewerAction = "none" | "quit" | "reload" | "select-run"

export type KeyResult = {
  readonly state: ViewerState
  readonly action: ViewerAction
}

export function createViewerState(overrides: Partial<ViewerState> = {}): ViewerState {
  return {
    runs: [],
    runIndex: 0,
    record: undefined,
    events: [],
    selectedNodeId: undefined,
    follow: true,
    paused: false,
    showAll: false,
    help: false,
    tree: false,
    notice: undefined,
    error: undefined,
    frame: 0,
    ...overrides,
  }
}

export function withRuns(state: ViewerState, runs: readonly ViewerRun[]): ViewerState {
  const runIndex = runs.length === 0 ? 0 : Math.max(0, Math.min(state.runIndex, runs.length - 1))
  return { ...state, runs, runIndex, error: runs.length === 0 ? state.error : undefined }
}

export function withRecord(
  state: ViewerState,
  record: DagRunRecordV1,
  events: readonly DagRunEvent[],
): ViewerState {
  const ids = new Set<DagNodeId>(record.nodes.map((node) => node.id))
  const selectedNodeId = state.selectedNodeId !== undefined && ids.has(state.selectedNodeId)
    ? state.selectedNodeId
    : defaultSelection(record)
  return { ...state, record, events, selectedNodeId, error: undefined }
}

export function defaultSelection(record: DagRunRecordV1): DagNodeId | undefined {
  return record.nodes.find((node) => node.state === "running")?.id
    ?? record.nodes.find((node) => node.state === "failed")?.id
    ?? record.nodes[0]?.id
}

export function applyKey(state: ViewerState, key: ViewerKey): KeyResult {
  switch (key) {
    case "quit":
      return { state, action: "quit" }
    case "up":
    case "down":
    case "left":
    case "right":
    case "page-up":
    case "page-down":
      return { state: navigate(state, key), action: "none" }
    case "run-prev":
      return { state: changeRun(state, -1), action: "select-run" }
    case "run-next":
      return { state: changeRun(state, 1), action: "select-run" }
    case "follow":
      return { state: { ...state, follow: !state.follow, notice: undefined }, action: "none" }
    case "pause":
      return { state: { ...state, paused: !state.paused, notice: undefined }, action: "none" }
    case "all":
      return { state: { ...state, showAll: !state.showAll, notice: undefined }, action: "reload" }
    case "tree":
      return { state: { ...state, tree: !state.tree }, action: "none" }
    case "refresh":
      return { state: { ...state, notice: undefined }, action: "reload" }
    case "help":
      return { state: { ...state, help: !state.help }, action: "none" }
    default:
      return { state, action: "none" }
  }
}

export function changeRun(state: ViewerState, delta: number): ViewerState {
  if (state.runs.length === 0) return state
  const runIndex = (state.runIndex + delta + state.runs.length) % state.runs.length
  return { ...state, runIndex, record: undefined, events: [], selectedNodeId: undefined }
}

export function navigate(state: ViewerState, key: ViewerKey): ViewerState {
  const record = state.record
  if (record === undefined || record.nodes.length === 0) return state
  const layout = layoutDag(record)
  const current = state.selectedNodeId === undefined ? undefined : layout.byId.get(state.selectedNodeId)
  if (current === undefined) {
    const first = record.nodes[0]
    return first === undefined ? state : { ...state, selectedNodeId: first.id }
  }
  const layer = layout.layers[current.layer] ?? []
  let next: { readonly node: DagNode } | undefined
  if (key === "up" || key === "down") {
    const delta = key === "up" ? -1 : 1
    const row = Math.max(0, Math.min(layer.length - 1, current.row + delta))
    next = layer[row]
  } else if (key === "page-up" || key === "page-down") {
    const delta = key === "page-up" ? -5 : 5
    const row = Math.max(0, Math.min(layer.length - 1, current.row + delta))
    next = layer[row]
  } else if (key === "left" || key === "right") {
    const targetLayer = current.layer + (key === "left" ? -1 : 1)
    const candidates = layout.layers[targetLayer]
    if (candidates !== undefined && candidates.length > 0) {
      next = candidates.reduce((best, candidate) =>
        Math.abs(candidate.row - current.row) < Math.abs(best.row - current.row) ? candidate : best,
      )
    }
  }
  if (next === undefined || next.node.id === current.node.id) return state
  return { ...state, selectedNodeId: next.node.id }
}

export function selectedNode(state: ViewerState): DagNode | undefined {
  if (state.record === undefined || state.selectedNodeId === undefined) return undefined
  return state.record.nodes.find((node) => node.id === state.selectedNodeId)
}
