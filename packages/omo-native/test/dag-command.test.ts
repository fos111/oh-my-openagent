import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { runDagCommand } from "../dag-viewer/cli"
import { makeRecord, makeStore, nodeId } from "./dag-viewer-fixture"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function capture(): { stream: NodeJS.WriteStream; output: () => string } {
  let data = ""
  const stream = {
    isTTY: false,
    columns: 120,
    rows: 40,
    write: (chunk: string) => {
      data += chunk
      return true
    },
  } as unknown as NodeJS.WriteStream
  return { stream, output: () => data }
}

function io() {
  const stdout = capture()
  const stderr = capture()
  return {
    cwd: process.cwd(),
    env: {},
    stdin: process.stdin,
    stdout: stdout.stream,
    stderr: stderr.stream,
    out: stdout.output,
    err: stderr.output,
  }
}

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dag-cli-"))
  roots.push(root)
  return root
}

describe("omo dag watch", () => {
  test("#given --help #when invoked #then the usage is printed", async () => {
    // given
    const context = io()

    // when
    const code = await runDagCommand(["--help"], context)

    // then
    expect(code).toBe(0)
    expect(context.out()).toContain("omo dag watch")
    expect(context.out()).toContain("--once")
  })

  test("#given an unknown option #when invoked #then it exits with a usage error", async () => {
    // given
    const context = io()

    // when
    const code = await runDagCommand(["watch", "--wat"], context)

    // then
    expect(code).toBe(2)
    expect(context.err()).toContain("unknown option")
  })

  test("#given a DAG store #when --once is used #then one frame is printed and the exit code is zero", async () => {
    // given
    const root = makeStore()
    roots.push(root)
    const context = io()

    // when
    const code = await runDagCommand(["watch", "--state-dir", root, "--once", "--no-color"], context)

    // then
    expect(code).toBe(0)
    expect(context.out()).toContain("Ship the widget")
    expect(context.out()).toContain("Build")
  })

  test("#given a DAG store #when --json is used #then the snapshot is machine readable", async () => {
    // given
    const root = makeStore()
    roots.push(root)
    const context = io()

    // when
    const code = await runDagCommand(["watch", "--state-dir", root, "--json"], context)
    const parsed = JSON.parse(context.out()) as {
      runs: unknown[]
      run: { nodes: { id: string }[]; counts: { total: number } }
    }

    // then
    expect(code).toBe(0)
    expect(parsed.runs).toHaveLength(1)
    expect(parsed.run.nodes.map((node) => node.id)).toContain("build")
    expect(parsed.run.counts.total).toBe(4)
  })

  test("#given no runs #when --once is used #then it explains the empty state and exits one", async () => {
    // given
    const root = tempDir()
    const context = io()

    // when
    const code = await runDagCommand(["watch", "--state-dir", root, "--once", "--no-color"], context)

    // then
    expect(code).toBe(1)
    expect(context.out()).toContain("no DAG runs")
  })

  test("#given a bad interval #when invoked #then it is rejected before reading the store", async () => {
    // given
    const context = io()

    // when
    const code = await runDagCommand(["watch", "--interval", "10"], context)

    // then
    expect(code).toBe(2)
    expect(context.err()).toContain("--interval")
  })

  test("#given a legacy in-project store #when --once is used #then the project is never adopted or written", async () => {
    // given
    const project = tempDir()
    const legacy = join(project, ".omo", "senpi-task", "dag")
    mkdirSync(join(legacy, "runs"), { recursive: true })
    mkdirSync(join(legacy, "events"), { recursive: true })
    const record = makeRecord()
    writeFileSync(join(legacy, "runs", `${record.runId}.json`), JSON.stringify(record))
    writeFileSync(join(legacy, "events", `${record.runId}.jsonl`), "")
    const before = snapshot(project)
    const context = io()

    // when
    const code = await runDagCommand(["watch", "--project", project, "--once", "--no-color"], context)

    // then
    expect(code).toBe(0)
    expect(snapshot(project)).toEqual(before)
    expect(existsSync(join(project, ".omo", "senpi-task", ".in-project"))).toBe(false)
  })
})

function snapshot(root: string): Record<string, number> {
  const result: Record<string, number> = {}
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      result[path.slice(root.length)] = statSync(path).mtimeMs
    }
  }
  walk(root)
  return result
}

describe("fixture", () => {
  test("#given the project fixture #when the record is read #then the labeled node is present", () => {
    expect(makeRecord().nodes.map((node) => node.id)).toContain(nodeId("build"))
  })
})
