import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  deriveCounts,
  formatDuration,
  isDagRunRecord,
  nodeElapsedMs,
  readRunRecord,
  runElapsedMs,
} from "../dag-viewer/run-record"
import { makeRecord, nodeId } from "./dag-viewer-fixture"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempFile(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dag-record-"))
  roots.push(root)
  const file = join(root, "run.json")
  writeFileSync(file, contents)
  return file
}

describe("readRunRecord", () => {
  test("#given a valid checkpoint #when read #then the record is returned", () => {
    // given
    const record = makeRecord()
    const file = tempFile(JSON.stringify(record))

    // when
    const read = readRunRecord(file)

    // then
    expect("record" in read && read.record.runId).toBe(record.runId)
    expect(isDagRunRecord(record)).toBe(true)
  })

  test("#given invalid JSON #when read #then it reports an error instead of throwing", () => {
    // given
    const file = tempFile("{")

    // when
    const read = readRunRecord(file)

    // then
    expect("error" in read && read.error).toContain("not valid JSON")
  })

  test("#given a mismatched schema #when read #then it is rejected", () => {
    // given
    const file = tempFile(JSON.stringify({ schemaVersion: 2, runId: "x" }))

    // when
    const read = readRunRecord(file)

    // then
    expect("error" in read && read.error).toContain("schema")
  })
})

describe("deriveCounts", () => {
  test("#given four nodes #when counted #then states are grouped and the total is exact", () => {
    // given
    const record = makeRecord()

    // when
    const counts = deriveCounts(record)

    // then
    expect(counts).toEqual({
      total: 4,
      pending: 1,
      blocked: 1,
      scheduled: 0,
      running: 1,
      paused: 0,
      completed: 1,
      failed: 0,
      cancelled: 0,
      skipped: 0,
    })
  })
})

describe("timings", () => {
  test("#given a running run #when the elapsed time is read at a fixed clock #then it uses that clock", () => {
    // given
    const record = makeRecord()
    const now = Date.parse("2026-10-30T10:02:00.000Z")

    // when
    const elapsed = runElapsedMs(record, now)

    // then
    expect(elapsed).toBe(120_000)
  })

  test("#given a completed run #when elapsed is read later #then it stops at completedAt", () => {
    // given
    const record = makeRecord({ status: "completed", completedAt: "2026-10-30T10:01:00.000Z" })

    // when
    const elapsed = runElapsedMs(record, Date.parse("2026-10-30T11:00:00.000Z"))

    // then
    expect(elapsed).toBe(60_000)
  })

  test("#given a completed node #when elapsed is read #then it uses completedAt", () => {
    // given
    const node = makeRecord().nodes[0]
    if (node === undefined) throw new Error("fixture node missing")

    // when
    const elapsed = nodeElapsedMs(node, Date.parse("2026-10-30T11:00:00.000Z"))

    // then
    expect(elapsed).toBe(40_000)
  })

  test("#given awkward durations #when formatted #then the unit is readable", () => {
    expect(formatDuration(12_000)).toBe("12s")
    expect(formatDuration(61_000)).toBe("1m 01s")
    expect(formatDuration(3_661_000)).toBe("1h 01m")
  })
})

describe("fixture ids", () => {
  test("#given a raw id #when branded #then it compares by value", () => {
    expect(nodeId("plan")).toBe(nodeId("plan"))
  })
})
