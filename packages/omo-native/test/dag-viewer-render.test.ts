import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"

import { createTheme } from "../dag-viewer/theme"
import { renderFrame } from "../dag-viewer/render"
import { listViewerRuns } from "../dag-viewer/paths"
import { visibleWidth } from "../dag-viewer/text"
import { makeRecord, makeStore, nodeId, sampleEvents } from "./dag-viewer-fixture"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function setup(record = makeRecord()) {
  const root = makeStore({ record })
  roots.push(root)
  const list = listViewerRuns([{ root, label: "test" }])
  const run = list.runs[0]
  if (run === undefined) throw new Error("fixture run missing")
  return { root, run, events: sampleEvents() }
}

function frame(overrides: Partial<Parameters<typeof renderFrame>[0]> = {}) {
  const { run, events } = setup()
  const record = makeRecord()
  return renderFrame({
    runs: [run],
    runIndex: 0,
    record,
    events,
    selectedNodeId: nodeId("build"),
    width: 100,
    height: 30,
    theme: createTheme({ color: false }),
    paused: false,
    follow: true,
    showAll: false,
    help: false,
    tree: false,
    notice: undefined,
    error: undefined,
    frame: 0,
    now: Date.parse("2026-10-30T10:02:00.000Z"),
    ...overrides,
  })
}

describe("renderFrame", () => {
  test("#given a running DAG #when rendered #then every line is exactly the terminal width", () => {
    // given
    const width = 100

    // when
    const lines = frame({ width, height: 30 })

    // then
    expect(lines).toHaveLength(30)
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true)
    expect(lines.join("\n")).toContain("Ship the widget")
    expect(lines.join("\n")).toContain("Build")
    expect(lines.join("\n")).toContain("events")
  })

  test("#given a narrow terminal #when rendered #then the tree fallback still fits", () => {
    // given
    const width = 40

    // when
    const lines = frame({ width, height: 24 })

    // then
    expect(lines).toHaveLength(24)
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true)
    expect(lines.join("\n")).toContain("tree")
  })

  test("#given tree mode #when rendered #then dependency lines are visible", () => {
    // when
    const lines = frame({ tree: true })

    // then
    const text = lines.join("\n")
    expect(text).toContain("├─")
    expect(text).toContain("Plan")
  })

  test("#given ANSI in model text #when rendered without color #then controls never reach the terminal", () => {
    // given
    const record = makeRecord({
      nodes: makeRecord().nodes.map((node) =>
        node.id === nodeId("build")
          ? { ...node, label: "\u001b[31mEVIL\u001b[0m", prompt: "\u0007hello\u001b[2J" }
          : node,
      ),
    })
    const { run, events } = setup(record)

    // when
    const lines = frame({ record, runs: [run], events, selectedNodeId: nodeId("build") })

    // then
    const text = lines.join("\n")
    expect(text).toContain("EVIL")
    expect(text).not.toContain("\u001b")
    expect(text).not.toContain("\u0007")
  })

  test("#given colors enabled #when rendered #then ANSI is present and widths stay exact", () => {
    // given
    const width = 100

    // when
    const lines = frame({ width, theme: createTheme({ color: true }) })

    // then
    expect(lines.join("\n")).toContain("\u001b[")
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true)
  })

  test("#given no runs #when rendered #then the empty state explains what to do", () => {
    // when
    const lines = frame({ record: undefined, runs: [], events: [] })

    // then
    const text = lines.join("\n")
    expect(text).toContain("no DAG runs")
    expect(text).toContain("mass ulw")
  })

  test("#given help toggled #when rendered #then every key is documented", () => {
    // when
    const text = frame({ help: true }).join("\n")

    // then
    expect(text).toContain("quit")
    expect(text).toContain("toggle all projects")
    expect(text).toContain("read-only")
  })
})
