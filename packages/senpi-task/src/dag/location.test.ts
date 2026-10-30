/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { dagDirectoryPaths, resolveDagStateDirectory } from "./location"
import { projectStateKey } from "../store/project-state-directory"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dag-location-"))
  roots.push(root)
  return root
}

describe("resolveDagStateDirectory", () => {
  test("#given an agent-dir env #when the project has no legacy store #then it returns the canonical projects store", () => {
    // given
    const root = tempRoot()
    const projectDir = join(root, "repo")
    const agentDir = join(root, "agent")
    mkdirSync(projectDir, { recursive: true })

    // when
    const resolved = resolveDagStateDirectory(projectDir, {
      env: { SENPI_CODING_AGENT_DIR: agentDir },
    })

    // then
    expect(resolved).toBe(join(agentDir, "projects", projectStateKey(projectDir), "senpi-task", "dag"))
  })

  test("#given a legacy in-project store with records #when resolved #then it is selected without writing the adoption marker", () => {
    // given
    const root = tempRoot()
    const projectDir = join(root, "repo")
    const legacyDag = join(projectDir, ".omo", "senpi-task", "dag")
    mkdirSync(join(legacyDag, "runs"), { recursive: true })
    writeFileSync(join(legacyDag, "runs", "run-1.json"), "{}")

    // when
    const resolved = resolveDagStateDirectory(projectDir, {
      env: { SENPI_CODING_AGENT_DIR: join(root, "agent") },
    })

    // then
    expect(resolved).toBe(legacyDag)
    expect(existsSync(join(projectDir, ".omo", "senpi-task", ".in-project"))).toBe(false)
  })

  test("#given a dag root #when split #then the run and event directories follow the store layout", () => {
    // given
    const dagRoot = "/state/dag"

    // when
    const paths = dagDirectoryPaths(dagRoot)

    // then
    expect(paths).toEqual({
      root: "/state/dag",
      runs: "/state/dag/runs",
      events: "/state/dag/events",
    })
  })
})
