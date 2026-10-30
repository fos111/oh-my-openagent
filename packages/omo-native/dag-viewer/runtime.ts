import { watch, type FSWatcher } from "node:fs"
import { join } from "node:path"

import type { DagRunEvent } from "@oh-my-opencode/senpi-task/dag"

import { applyKey, createViewerState, withRecord, withRuns, type ViewerState } from "./app"
import { createEventTail, readEventTail, type EventTailState } from "./event-tail"
import { decodeKeys } from "./input"
import { listViewerRuns, resolveViewerRoots, selectRunIndex, type ViewerRoot } from "./paths"
import { deriveCounts, readRunRecord } from "./run-record"
import { renderFrame } from "./render"
import { createTheme } from "./theme"

export type DagViewerOptions = {
  readonly cwd: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly stdin: NodeJS.ReadStream
  readonly stdout: NodeJS.WriteStream
  readonly stderr: NodeJS.WriteStream
  readonly projectDir?: string
  readonly stateDir?: string
  readonly agentDir?: string
  readonly runSelector?: string
  readonly allProjects: boolean
  readonly intervalMs: number
  readonly once: boolean
  readonly json: boolean
  readonly tree: boolean
  readonly color?: boolean
  readonly ascii?: boolean
}

type Snapshot = {
  readonly state: ViewerState
  readonly tail: EventTailState
  readonly roots: readonly ViewerRoot[]
}

export async function runViewer(options: DagViewerOptions): Promise<number> {
  const env = options.agentDir === undefined
    ? options.env
    : { ...options.env, OMO_CODING_AGENT_DIR: options.agentDir }
  const context: DagViewerOptions = { ...options, env }
  if (options.json) return printJson(context)
  if (options.once) return printOnce(context)
  if (options.stdout.isTTY !== true) {
    options.stderr.write("omo dag watch: stdout is not a TTY; use --once or --json.\n")
    return 2
  }
  return runInteractive(context)
}

function loadSnapshot(options: DagViewerOptions, previous?: ViewerState): Snapshot {
  const allProjects = previous?.showAll ?? options.allProjects
  const roots = resolveViewerRoots({
    cwd: options.cwd,
    env: options.env,
    projectDir: options.projectDir,
    stateDir: options.stateDir,
    allProjects,
  })
  const list = listViewerRuns(roots)
  const previousRunId = previous?.record?.runId
  let runIndex = previousRunId === undefined ? -1 : list.runs.findIndex((run) => run.runId === previousRunId)
  if (runIndex < 0 && previous === undefined && options.runSelector !== undefined) {
    runIndex = selectRunIndex(list.runs, options.runSelector)
  }
  if (runIndex < 0) runIndex = previous === undefined ? 0 : Math.min(previous.runIndex, list.runs.length - 1)
  if (runIndex < 0 || runIndex >= list.runs.length) runIndex = 0

  const base = createViewerState({
    runs: list.runs,
    runIndex,
    follow: options.runSelector === undefined ? previous?.follow ?? true : false,
    paused: previous?.paused ?? false,
    showAll: allProjects,
    tree: previous?.tree ?? options.tree,
    help: previous?.help ?? false,
    notice: list.errors.length === 0 ? undefined : `${list.errors.length} unreadable run(s)`,
  })
  const run = list.runs[runIndex]
  if (run === undefined) {
    return { state: withRuns(base, []), tail: createEventTail(), roots }
  }
  const read = readRunRecord(run.filePath)
  if ("error" in read) {
    return { state: { ...withRuns(base, list.runs), error: read.error }, tail: createEventTail(), roots }
  }
  const tail = createEventTail()
  const events = readEventTail(run.eventPath, tail)
  return { state: withRecord(withRuns(base, list.runs), read.record, events), tail, roots }
}

function printOnce(options: DagViewerOptions): number {
  const snapshot = loadSnapshot(options)
  const theme = createTheme({
    color: options.color ?? (options.stdout.isTTY === true && options.env.NO_COLOR === undefined),
    ascii: options.ascii ?? options.env.OMO_ASCII === "1",
    env: options.env,
    isTTY: options.stdout.isTTY === true,
  })
  const state = snapshot.state
  const lines = renderFrame({
    ...state,
    width: options.stdout.columns ?? 100,
    height: options.stdout.rows ?? 30,
    theme,
    now: Date.now(),
  })
  options.stdout.write(`${lines.join("\n")}\n`)
  return state.record === undefined ? 1 : 0
}

function printJson(options: DagViewerOptions): number {
  const snapshot = loadSnapshot(options)
  const state = snapshot.state
  const record = state.record
  const payload = {
    runs: state.runs.map((run) => ({
      runId: run.runId,
      name: run.name,
      status: run.status,
      counts: run.counts,
      root: run.root,
      project: run.projectLabel,
    })),
    run: record === undefined
      ? null
      : {
          runId: record.runId,
          name: record.name,
          status: record.status,
          generation: record.generation,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          counts: deriveCounts(record),
          criticalPath: record.criticalPath,
          bottlenecks: record.bottlenecks,
          edges: record.edges,
          nodes: record.nodes.map((node) => ({
            id: node.id,
            label: node.label,
            state: node.state,
            route: node.route,
            dependsOn: node.dependsOn,
            taskId: node.taskId,
            attempt: node.attempt,
            execAttempt: node.execAttempt,
            error: node.error,
          })),
        },
    events: state.events.slice(-200),
  }
  options.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  return record === undefined ? 1 : 0
}

async function runInteractive(options: DagViewerOptions): Promise<number> {
  let snapshot = loadSnapshot(options)
  const theme = createTheme({
    color: options.color ?? (options.env.NO_COLOR === undefined && options.stdout.isTTY === true),
    ascii: options.ascii ?? options.env.OMO_ASCII === "1",
    env: options.env,
    isTTY: options.stdout.isTTY === true,
  })
  const { stdin, stdout } = options
  const watchers: FSWatcher[] = []
  let finished = false
  let resolveFn: (code: number) => void = () => {}
  let timer: NodeJS.Timeout | undefined
  let refreshTimer: NodeJS.Timeout | undefined

  function size(): { width: number; height: number } {
    return {
      width: Math.max(20, stdout.columns ?? 100),
      height: Math.max(6, stdout.rows ?? 30),
    }
  }

  function render(): void {
    const dimensions = size()
    const lines = renderFrame({
      ...snapshot.state,
      width: dimensions.width,
      height: dimensions.height,
      theme,
      now: Date.now(),
    })
    try {
      stdout.write(`\u001b[H${lines.join("\r\n")}\u001b[J`)
    } catch {
      finish(0)
    }
  }

  function schedule(): void {
    if (finished) return
    if (refreshTimer !== undefined) return
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      if (!finished) render()
    }, 30)
  }

  function refresh(): void {
    if (finished) return
    const currentRunId = snapshot.state.record?.runId
    const list = listViewerRuns(snapshot.roots)
    const currentIndex = currentRunId === undefined
      ? -1
      : list.runs.findIndex((run) => run.runId === currentRunId)
    if (currentIndex < 0) {
      snapshot = loadSnapshot(options, snapshot.state)
      schedule()
      return
    }
    const run = list.runs[currentIndex]
    if (run === undefined) return
    const read = readRunRecord(run.filePath)
    if ("record" in read) {
      const events = readEventTail(run.eventPath, snapshot.tail)
      const merged = events.length === 0 ? snapshot.state.events : appendEvents(snapshot.state.events, events)
      snapshot = {
        ...snapshot,
        state: withRuns(withRecord(snapshot.state, read.record, merged), list.runs),
      }
    } else {
      snapshot = { ...snapshot, state: { ...withRuns(snapshot.state, list.runs), error: read.error } }
    }
  }

  function queueRefresh(): void {
    if (finished) return
    if (refreshTimer !== undefined) return
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      refresh()
      schedule()
    }, 60)
  }

  function followNewest(): void {
    if (!snapshot.state.follow) return
    const newest = snapshot.state.runs[0]
    const current = snapshot.state.record
    if (newest === undefined || current === undefined || newest.runId === current.runId) return
    snapshot = loadSnapshot(options, { ...snapshot.state, record: undefined, runIndex: 0 })
    schedule()
  }

  function cleanup(): void {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer)
    if (timer !== undefined) clearInterval(timer)
    for (const watcher of watchers.splice(0)) {
      try {
        watcher.close()
      } catch {
        // The watcher is already closed.
      }
    }
    try {
      stdin.off?.("data", onData)
    } catch {
      // The stream is already closed.
    }
    try {
      stdout.write("\u001b[?25h\u001b[?1049l\u001b[0m")
    } catch {
      // The terminal is already gone.
    }
    try {
      stdin.setRawMode?.(false)
      stdin.pause()
    } catch {
      // The stream is already closed.
    }
    process.off("SIGWINCH", onResize)
    process.off("SIGINT", onSignal)
    process.off("SIGTERM", onSignal)
  }

  function finish(code: number): void {
    if (finished) return
    finished = true
    cleanup()
    resolveFn(code)
  }

  function onResize(): void {
    schedule()
  }

  function onSignal(): void {
    finish(0)
  }

  function onData(chunk: Buffer | string): void {
    if (finished) return
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8")
    if (text === "\u001b") {
      finish(0)
      return
    }
    for (const key of decodeKeys(text)) {
      const result = applyKey(snapshot.state, key)
      snapshot = { ...snapshot, state: result.state }
      if (result.action === "quit") {
        finish(0)
        return
      }
      if (result.action === "reload") {
        snapshot = loadSnapshot(options, snapshot.state)
        schedule()
        continue
      }
      if (result.action === "select-run") {
        snapshot = { ...snapshot, state: { ...snapshot.state, follow: false } }
        snapshot = loadSnapshot(options, snapshot.state)
        schedule()
        continue
      }
      schedule()
    }
  }

  return await new Promise<number>((resolve) => {
    resolveFn = resolve
    process.on("SIGWINCH", onResize)
    process.on("SIGINT", onSignal)
    process.on("SIGTERM", onSignal)
    try {
      stdout.write("\u001b[?1049h\u001b[?25l\u001b[2J\u001b[H")
      stdin.setRawMode?.(true)
      stdin.resume()
    } catch {
      finish(2)
      return
    }
    stdin.on("data", onData)
    for (const directory of [join(snapshot.roots[0]?.root ?? ".", "runs"), join(snapshot.roots[0]?.root ?? ".", "events")]) {
      try {
        watchers.push(watch(directory, { persistent: false }, () => queueRefresh()))
      } catch {
        // The directory does not exist yet; the poll loop covers it.
      }
    }
    timer = setInterval(() => {
      if (finished) return
      snapshot = { ...snapshot, state: { ...snapshot.state, frame: snapshot.state.frame + 1 } }
      if (snapshot.state.paused) return
      refresh()
      followNewest()
      schedule()
    }, Math.max(250, options.intervalMs))
    render()
  })
}

function appendEvents(existing: readonly DagRunEvent[], incoming: readonly DagRunEvent[]): DagRunEvent[] {
  if (incoming.length === 0) return [...existing]
  const seen = new Set(existing.map((event) => `${event.seq}:${event.type}`))
  const merged = [...existing]
  for (const event of incoming) {
    const key = `${event.seq}:${event.type}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(event)
  }
  return merged.slice(-500)
}
