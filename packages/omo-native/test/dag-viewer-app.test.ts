import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"

import {
  applyKey,
  changeRun,
  createViewerState,
  defaultSelection,
  navigate,
  withRecord,
  withRuns,
} from "../dag-viewer/app"
import { listViewerRuns } from "../dag-viewer/paths"
import { makeRecord, makeStore, nodeId } from "./dag-viewer-fixture"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function state() {
  const record = makeRecord()
  const base = withRecord(createViewerState(), record, [])
  return { record, base }
}

describe("viewer selection", () => {
  test("#given a running node #when no node is selected #then the running node is preferred", () => {
    // given
    const record = makeRecord()

    // then
    expect(defaultSelection(record)).toBe(nodeId("build"))
  })

  test("#given a selected node #when moving down and up #then it walks the layer", () => {
    // given
    const { base } = state()

    // when
    const down = navigate(base, "down")
    const up = navigate(down, "up")

    // then
    expect(down.selectedNodeId).toBe(nodeId("docs"))
    expect(up.selectedNodeId).toBe(nodeId("build"))
  })

  test("#given a selected node #when moving right and left #then it changes layers", () => {
    // given
    const { base } = state()

    // when
    const right = navigate(base, "right")
    const left = navigate(base, "left")

    // then
    expect(right.selectedNodeId).toBe(nodeId("verify"))
    expect(left.selectedNodeId).toBe(nodeId("plan"))
  })

  test("#given two runs #when changing run #then the index wraps", () => {
    // given
    const first = makeStore()
    const second = makeStore()
    roots.push(first, second)
    const runs = [...listViewerRuns([{ root: first, label: "a" }]).runs, ...listViewerRuns([{ root: second, label: "b" }]).runs]
    const base = withRuns(createViewerState(), runs)

    // when
    const previous = changeRun(base, -1)
    const next = changeRun(base, 1)

    // then
    expect(previous.runIndex).toBe(runs.length - 1)
    expect(next.runIndex).toBe(1 % runs.length)
  })
})

describe("key handling", () => {
  test("#given viewer state #when toggles are pressed #then the matching flag flips", () => {
    // given
    const { base } = state()

    // when
    const paused = applyKey(base, "pause").state
    const follow = applyKey(paused, "follow").state
    const tree = applyKey(follow, "tree").state
    const help = applyKey(tree, "help").state

    // then
    expect(paused.paused).toBe(true)
    expect(follow.follow).toBe(false)
    expect(tree.tree).toBe(true)
    expect(help.help).toBe(true)
  })

  test("#given the all-projects key #when pressed #then a reload is requested", () => {
    // given
    const { base } = state()

    // when
    const result = applyKey(base, "all")

    // then
    expect(result.action).toBe("reload")
    expect(result.state.showAll).toBe(true)
  })

  test("#given the quit key #when pressed #then the viewer exits", () => {
    // given
    const { base } = state()

    // then
    expect(applyKey(base, "quit").action).toBe("quit")
  })
})
