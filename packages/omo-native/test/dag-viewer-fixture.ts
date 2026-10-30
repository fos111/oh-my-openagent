import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type {
  DagEdge,
  DagNode,
  DagNodeId,
  DagRunEvent,
  DagRunRecordV1,
  DagRunId,
  DagWave,
} from "@oh-my-opencode/senpi-task/dag"

export const RUN_ID = "dag_0123456789ab" as DagRunId
export const CREATED_AT = "2026-10-30T10:00:00.000Z"
export const UPDATED_AT = "2026-10-30T10:02:00.000Z"

export function nodeId(value: string): DagNodeId {
  return value as DagNodeId
}

export function makeRecord(overrides: Partial<DagRunRecordV1> = {}): DagRunRecordV1 {
  const nodes: DagNode[] = [
    {
      id: nodeId("plan"),
      label: "Plan",
      prompt: "Read the request and split it into steps.",
      route: { kind: "category", category: "unspecified-high" },
      dependsOn: [],
      state: "completed",
      attempt: 1,
      execAttempt: 1,
      createdAt: CREATED_AT,
      startedAt: CREATED_AT,
      completedAt: "2026-10-30T10:00:40.000Z",
      output: "Plan ready.",
    },
    {
      id: nodeId("build"),
      label: "Build",
      prompt: "Implement the feature.",
      route: { kind: "category", category: "deep" },
      dependsOn: [nodeId("plan")],
      state: "running",
      taskId: "task-build-1",
      attempt: 1,
      execAttempt: 2,
      createdAt: CREATED_AT,
      startedAt: "2026-10-30T10:00:41.000Z",
      lastActivityAt: "2026-10-30T10:01:55.000Z",
    },
    {
      id: nodeId("docs"),
      label: "Docs",
      prompt: "Write the reference page.",
      route: { kind: "agent", agent: "librarian" },
      dependsOn: [nodeId("plan")],
      state: "pending",
      attempt: 0,
      createdAt: CREATED_AT,
    },
    {
      id: nodeId("verify"),
      label: "Verify",
      prompt: "Run the checks.",
      route: { kind: "category", category: "unspecified-high" },
      dependsOn: [nodeId("build"), nodeId("docs")],
      state: "blocked",
      attempt: 0,
      createdAt: CREATED_AT,
    },
  ]
  const edges: DagEdge[] = [
    { from: nodeId("plan"), to: nodeId("build") },
    { from: nodeId("plan"), to: nodeId("docs") },
    { from: nodeId("build"), to: nodeId("verify") },
    { from: nodeId("docs"), to: nodeId("verify") },
  ]
  const waves: DagWave[] = [
    { index: 0, nodeIds: [nodeId("plan")] },
    { index: 1, nodeIds: [nodeId("build"), nodeId("docs")] },
    { index: 2, nodeIds: [nodeId("verify")] },
  ]
  return {
    schemaVersion: 1,
    checkpointSeq: 12,
    runId: RUN_ID,
    runKey: "demo",
    name: "Ship the widget",
    parentSessionId: "ses_parent",
    rootSessionId: "ses_parent",
    definitionFingerprint: "fingerprint",
    definition: {
      key: "demo",
      name: "Ship the widget",
      nodes: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        prompt: node.prompt,
        ...(node.route.kind === "category" ? { category: node.route.category } : { subagent_type: node.route.agent }),
        dependsOn: node.dependsOn,
        effectivePrompt: node.prompt,
      })),
    },
    status: "running",
    generation: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    startedAt: CREATED_AT,
    nodes,
    edges,
    waves,
    criticalPath: [nodeId("plan"), nodeId("build"), nodeId("verify")],
    bottlenecks: [{ nodeId: nodeId("build"), blockedCount: 1 }],
    diagnostics: [],
    ...overrides,
  }
}

export function makeEvent(seq: number, payload: Record<string, unknown>): DagRunEvent {
  return {
    schemaVersion: 1,
    runId: RUN_ID,
    seq,
    at: new Date(Date.parse(CREATED_AT) + seq * 1000).toISOString(),
    lane: "boundary",
    ...payload,
  } as DagRunEvent
}

export function sampleEvents(): DagRunEvent[] {
  return [
    makeEvent(1, {
      type: "dag.run.created",
      runKey: "demo",
      name: "Ship the widget",
      definitionFingerprint: "fingerprint",
      nodeCount: 4,
      edgeCount: 4,
    }),
    makeEvent(2, { type: "dag.run.started", generation: 1 }),
    makeEvent(3, {
      type: "dag.node.transitioned",
      nodeId: "plan",
      from: "pending",
      to: "running",
      reason: { kind: "started" },
    }),
    makeEvent(4, {
      type: "dag.node.transitioned",
      nodeId: "plan",
      from: "running",
      to: "completed",
      reason: { kind: "succeeded" },
    }),
    makeEvent(5, {
      type: "dag.node.task-attached",
      nodeId: "build",
      taskId: "task-build-1",
      attempt: 1,
    }),
  ]
}

export function makeStore(options: { readonly record?: DagRunRecordV1; readonly events?: readonly DagRunEvent[] } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "omo-dag-viewer-"))
  const runs = join(root, "runs")
  const events = join(root, "events")
  mkdirSync(runs, { recursive: true })
  mkdirSync(events, { recursive: true })
  const record = options.record ?? makeRecord()
  writeFileSync(join(runs, `${record.runId}.json`), JSON.stringify(record))
  const lines = (options.events ?? sampleEvents()).map((event) => JSON.stringify(event))
  writeFileSync(join(events, `${record.runId}.jsonl`), `${lines.join("\n")}\n`)
  return root
}

export function writeRun(root: string, record: DagRunRecordV1, events: readonly DagRunEvent[] = []): void {
  const runs = join(root, "runs")
  const eventsDir = join(root, "events")
  mkdirSync(runs, { recursive: true })
  mkdirSync(eventsDir, { recursive: true })
  writeFileSync(join(runs, `${record.runId}.json`), JSON.stringify(record))
  writeFileSync(join(eventsDir, `${record.runId}.jsonl`), events.map((event) => `${JSON.stringify(event)}\n`).join(""))
}
