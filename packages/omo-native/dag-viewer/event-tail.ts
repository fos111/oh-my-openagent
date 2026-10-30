import { closeSync, openSync, readSync, statSync } from "node:fs"

import type { DagRunEvent } from "@oh-my-opencode/senpi-task/dag"

export type EventTailState = {
  offset: number
  pending: string
  initialized: boolean
}

export type EventTailOptions = {
  readonly backfillBytes?: number
  readonly maxReadBytes?: number
  readonly maxEvents?: number
}

const DEFAULT_BACKFILL_BYTES = 256 * 1024
const DEFAULT_MAX_READ_BYTES = 1024 * 1024
const DEFAULT_MAX_EVENTS = 500

export function createEventTail(): EventTailState {
  return { offset: 0, pending: "", initialized: false }
}

export function readEventTail(filePath: string, state: EventTailState, options: EventTailOptions = {}): DagRunEvent[] {
  const backfillBytes = options.backfillBytes ?? DEFAULT_BACKFILL_BYTES
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_READ_BYTES
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS
  let size: number
  try {
    size = statSync(filePath).size
  } catch {
    return []
  }
  if (!state.initialized) {
    state.initialized = true
    state.offset = Math.max(0, size - backfillBytes)
    state.pending = ""
  }
  if (size < state.offset) {
    state.offset = 0
    state.pending = ""
  }
  if (size > state.offset + maxReadBytes) {
    state.offset = size - maxReadBytes
    state.pending = ""
  }
  if (size === state.offset) return []

  const start = state.offset
  const length = size - start
  const buffer = Buffer.allocUnsafe(length)
  let fd: number | undefined
  let startsAtLineBoundary = start === 0
  try {
    fd = openSync(filePath, "r")
    if (!startsAtLineBoundary) {
      const previous = Buffer.allocUnsafe(1)
      startsAtLineBoundary = readSync(fd, previous, 0, 1, start - 1) === 1 && previous[0] === 0x0a
    }
    let read = 0
    while (read < length) {
      const count = readSync(fd, buffer, read, length - read, start + read)
      if (count <= 0) break
      read += count
    }
    if (read < length) return []
  } catch {
    return []
  } finally {
    if (fd !== undefined) closeSync(fd)
  }

  const dropFirstPartial = state.pending.length === 0 && !startsAtLineBoundary
  state.offset = size
  const chunk = state.pending + buffer.toString("utf8")
  const lines = chunk.split("\n")
  const incomplete = lines.pop() ?? ""
  state.pending = incomplete
  if (dropFirstPartial && lines.length > 0) lines.shift()

  const events: DagRunEvent[] = []
  for (const line of lines) {
    const event = parseEventLine(line)
    if (event !== undefined) events.push(event)
  }
  return maxEvents > 0 && events.length > maxEvents ? events.slice(-maxEvents) : events
}

export function readRecentEvents(filePath: string, options: EventTailOptions = {}): DagRunEvent[] {
  const tail = createEventTail()
  return readEventTail(filePath, tail, {
    ...options,
    backfillBytes: options.backfillBytes ?? DEFAULT_BACKFILL_BYTES,
  })
}

export function parseEventLine(line: string): DagRunEvent | undefined {
  const trimmed = line.trim()
  if (trimmed.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return undefined
  }
  if (typeof parsed !== "object" || parsed === null) return undefined
  const event = parsed as Record<string, unknown>
  if (
    typeof event.type !== "string"
    || typeof event.seq !== "number"
    || typeof event.runId !== "string"
    || typeof event.at !== "string"
  ) {
    return undefined
  }
  return parsed as DagRunEvent
}

export function eventClock(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return "--:--:--"
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
}
