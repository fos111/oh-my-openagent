import { describe, expect, test } from "bun:test"

import { layoutDag } from "../dag-viewer/layout"
import { makeRecord, nodeId } from "./dag-viewer-fixture"

describe("layoutDag", () => {
  test("#given a diamond #when laid out #then nodes group by dependency depth", () => {
    // given
    const record = makeRecord()

    // when
    const layout = layoutDag(record)

    // then
    expect(layout.layers.map((layer) => layer.map((positioned) => positioned.node.id))).toEqual([
      [nodeId("plan")],
      [nodeId("build"), nodeId("docs")],
      [nodeId("verify")],
    ])
    expect(layout.byId.get(nodeId("verify"))?.layer).toBe(2)
    expect(layout.maxRows).toBe(2)
    expect(layout.longEdgeCount).toBe(0)
  })

  test("#given two edges into one node #when routed #then they receive distinct lanes", () => {
    // given
    const record = makeRecord()

    // when
    const layout = layoutDag(record)
    const incoming = layout.edges.filter((edge) => edge.to === nodeId("verify"))

    // then
    expect(incoming.map((edge) => edge.lane).sort()).toEqual([0, 1])
    expect(incoming.every((edge) => edge.laneCount === 2)).toBe(true)
  })

  test("#given a dependency that skips a layer #when laid out #then the edge is marked long", () => {
    // given
    const record = makeRecord({
      edges: [
        ...makeRecord().edges,
        { from: nodeId("plan"), to: nodeId("verify") },
      ],
    })

    // when
    const layout = layoutDag(record)

    // then
    expect(layout.longEdgeCount).toBe(1)
    expect(layout.edges.find((edge) => edge.from === nodeId("plan") && edge.to === nodeId("verify"))?.long).toBe(true)
  })

  test("#given a critical path and bottlenecks #when laid out #then both are exposed", () => {
    // given
    const record = makeRecord()

    // when
    const layout = layoutDag(record)

    // then
    expect([...layout.critical]).toEqual([nodeId("plan"), nodeId("build"), nodeId("verify")])
    expect(layout.bottlenecks.get(nodeId("build"))).toBe(1)
  })

  test("#given a cycle #when laid out #then every node still receives a layer", () => {
    // given
    const record = makeRecord({
      nodes: makeRecord().nodes.map((node) =>
        node.id === nodeId("plan") ? { ...node, dependsOn: [nodeId("verify")] } : node,
      ),
    })

    // when
    const layout = layoutDag(record)

    // then
    expect(layout.positioned).toHaveLength(4)
    expect(layout.byId.get(nodeId("plan"))).toBeDefined()
  })
})
