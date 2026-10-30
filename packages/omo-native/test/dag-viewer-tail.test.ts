import { afterEach, describe, expect, test } from "bun:test"
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createEventTail, readEventTail, readRecentEvents } from "../dag-viewer/event-tail"
import { makeEvent } from "./dag-viewer-fixture"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempLog(): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dag-tail-"))
  roots.push(root)
  return join(root, "events.jsonl")
}

describe("readEventTail", () => {
  test("#given two complete events #when the tail is first read #then both are returned", () => {
    // given
    const file = tempLog()
    const first = makeEvent(1, { type: "dag.run.started", generation: 1 })
    const second = makeEvent(2, { type: "dag.run.paused", reason: "user" })
    writeFileSync(file, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`)
    const state = createEventTail()

    // when
    const events = readEventTail(file, state)

    // then
    expect(events.map((event) => event.seq)).toEqual([1, 2])
  })

  test("#given a partially written line #when read #then it is buffered until the line completes", () => {
    // given
    const file = tempLog()
    writeFileSync(file, "")
    const state = createEventTail()
    const event = makeEvent(7, { type: "dag.run.completed", counts: { total: 1, pending: 0, blocked: 0, scheduled: 0, running: 0, completed: 1, failed: 0, cancelled: 0, skipped: 0 } })
    const line = JSON.stringify(event)
    appendFileSync(file, line.slice(0, 20))

    // when
    const before = readEventTail(file, state)

    // then
    expect(before).toEqual([])

    // when
    appendFileSync(file, `${line.slice(20)}\n`)
    const after = readEventTail(file, state)

    // then
    expect(after.map((entry) => entry.seq)).toEqual([7])
  })

  test("#given a torn trailing line #when read #then only the valid events are returned", () => {
    // given
    const file = tempLog()
    const event = makeEvent(3, { type: "dag.run.started", generation: 2 })
    writeFileSync(file, `${JSON.stringify(event)}\n{"schemaVersion":1,"runId":`)
    const state = createEventTail()

    // when
    const events = readEventTail(file, state)

    // then
    expect(events.map((entry) => entry.seq)).toEqual([3])
  })

  test("#given a truncated log #when read #then the offset resets and the new contents win", () => {
    // given
    const file = tempLog()
    const first = Array.from({ length: 5 }, (_, index) =>
      JSON.stringify(makeEvent(index + 1, { type: "dag.run.started", generation: index + 1 })),
    ).join("\n")
    writeFileSync(file, `${first}\n`)
    const state = createEventTail()
    readEventTail(file, state)

    // when
    const second = makeEvent(2, { type: "dag.run.paused", reason: "user" })
    writeFileSync(file, "")
    appendFileSync(file, `${JSON.stringify(second)}\n`)
    const events = readEventTail(file, state)

    // then
    expect(events.map((entry) => entry.seq)).toEqual([2])
  })

  test("#given a complete event without a trailing newline #when the newline arrives #then it is emitted once", () => {
    // given
    const file = tempLog()
    const event = makeEvent(4, { type: "dag.run.started", generation: 3 })
    writeFileSync(file, JSON.stringify(event))
    const state = createEventTail()
    expect(readEventTail(file, state)).toEqual([])

    // when
    appendFileSync(file, "\n")
    const first = readEventTail(file, state)
    const second = readEventTail(file, state)

    // then
    expect(first.map((entry) => entry.seq)).toEqual([4])
    expect(second).toEqual([])
  })

  test("#given a large log #when only a recent slice is read #then the tail is bounded", () => {
    // given
    const file = tempLog()
    const lines = Array.from({ length: 20 }, (_, index) => JSON.stringify(makeEvent(index + 1, { type: "dag.run.started", generation: index + 1 })))
    writeFileSync(file, `${lines.join("\n")}\n`)

    // when
    const events = readRecentEvents(file, { backfillBytes: 200, maxEvents: 3 })

    // then
    expect(events.length).toBeLessThanOrEqual(3)
  })
})
