import type { DagBottleneck, DagEdge, DagNode, DagNodeId } from "@oh-my-opencode/senpi-task/dag"

export type LayoutInput = {
  readonly nodes: readonly DagNode[]
  readonly edges: readonly DagEdge[]
  readonly criticalPath: readonly string[]
  readonly bottlenecks: readonly DagBottleneck[]
}

export type PositionedNode = {
  readonly node: DagNode
  readonly layer: number
  readonly row: number
}

export type RoutedEdge = {
  readonly from: DagNodeId
  readonly to: DagNodeId
  readonly fromLayer: number
  readonly fromRow: number
  readonly toLayer: number
  readonly toRow: number
  readonly lane: number
  readonly laneCount: number
  readonly long: boolean
}

export type GraphLayout = {
  readonly positioned: readonly PositionedNode[]
  readonly byId: ReadonlyMap<DagNodeId, PositionedNode>
  readonly edges: readonly RoutedEdge[]
  readonly layers: readonly (readonly PositionedNode[])[]
  readonly layerCount: number
  readonly maxRows: number
  readonly longEdgeCount: number
  readonly critical: ReadonlySet<string>
  readonly bottlenecks: ReadonlyMap<string, number>
}

export function layoutDag(input: LayoutInput): GraphLayout {
  const order = new Map<string, number>()
  const nodeById = new Map<DagNodeId, DagNode>()
  for (const [index, node] of input.nodes.entries()) {
    order.set(node.id, index)
    nodeById.set(node.id, node)
  }

  const deps = new Map<DagNodeId, DagNodeId[]>()
  const children = new Map<DagNodeId, DagNodeId[]>()
  for (const node of input.nodes) {
    deps.set(node.id, [])
    children.set(node.id, [])
  }
  for (const node of input.nodes) {
    for (const dependency of node.dependsOn) {
      if (!nodeById.has(dependency)) continue
      deps.get(node.id)?.push(dependency)
      children.get(dependency)?.push(node.id)
    }
  }
  for (const edge of input.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue
    if (edge.from === edge.to) continue
    const list = children.get(edge.from)
    if (list !== undefined && !list.includes(edge.to)) list.push(edge.to)
    const depList = deps.get(edge.to)
    if (depList !== undefined && !depList.includes(edge.from)) depList.push(edge.from)
  }

  const indegree = new Map<DagNodeId, number>()
  for (const node of input.nodes) indegree.set(node.id, deps.get(node.id)?.length ?? 0)
  const layerOf = new Map<DagNodeId, number>()
  const queue = input.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id)
  for (const id of queue) layerOf.set(id, 0)
  let cursor = 0
  while (cursor < queue.length) {
    const id = queue[cursor]
    cursor += 1
    if (id === undefined) continue
    for (const child of children.get(id) ?? []) {
      const nextLayer = Math.max(layerOf.get(child) ?? 0, (layerOf.get(id) ?? 0) + 1)
      layerOf.set(child, nextLayer)
      const remaining = (indegree.get(child) ?? 1) - 1
      indegree.set(child, remaining)
      if (remaining === 0) queue.push(child)
    }
  }

  let maxLayer = 0
  for (const layer of layerOf.values()) maxLayer = Math.max(maxLayer, layer)
  for (const node of input.nodes) {
    if (!layerOf.has(node.id)) {
      maxLayer += 1
      layerOf.set(node.id, maxLayer)
    }
  }

  const grouped = new Map<number, DagNode[]>()
  for (const node of input.nodes) {
    const layer = layerOf.get(node.id) ?? 0
    const group = grouped.get(layer)
    if (group === undefined) grouped.set(layer, [node])
    else group.push(node)
  }

  const rowsById = new Map<DagNodeId, number>()
  const placed: PositionedNode[] = []
  const layers: PositionedNode[][] = []
  const sortedLayers = [...grouped.keys()].sort((left, right) => left - right)
  for (const layer of sortedLayers) {
    const group = grouped.get(layer) ?? []
    const scored = group.map((node, index) => {
      const parentRows = (deps.get(node.id) ?? [])
        .map((parent) => rowsById.get(parent))
        .filter((row): row is number => row !== undefined)
      const barycenter = parentRows.length === 0
        ? index
        : parentRows.reduce((sum, row) => sum + row, 0) / parentRows.length
      return { node, barycenter, index }
    })
    scored.sort((left, right) => {
      const byBarycenter = left.barycenter - right.barycenter
      if (byBarycenter !== 0) return byBarycenter
      return (order.get(left.node.id) ?? left.index) - (order.get(right.node.id) ?? right.index)
    })
    const positionedLayer: PositionedNode[] = []
    for (const [row, entry] of scored.entries()) {
      const positioned = { node: entry.node, layer, row }
      positionedLayer.push(positioned)
      placed.push(positioned)
      rowsById.set(entry.node.id, row)
    }
    layers[layer] = positionedLayer
  }

  const byId = new Map<DagNodeId, PositionedNode>(placed.map((positioned) => [positioned.node.id, positioned]))
  const laneCounts = new Map<DagNodeId, number>()
  const rawEdges: RoutedEdge[] = []
  const seen = new Set<string>()
  for (const positioned of placed) {
    for (const childId of children.get(positioned.node.id) ?? []) {
      const key = `${positioned.node.id}\u0000${childId}`
      if (seen.has(key)) continue
      seen.add(key)
      const child = byId.get(childId)
      if (child === undefined) continue
      const lane = laneCounts.get(childId) ?? 0
      laneCounts.set(childId, lane + 1)
      rawEdges.push({
        from: positioned.node.id,
        to: childId,
        fromLayer: positioned.layer,
        fromRow: positioned.row,
        toLayer: child.layer,
        toRow: child.row,
        lane,
        laneCount: 0,
        long: child.layer > positioned.layer + 1,
      })
    }
  }
  const edges = rawEdges.map((edge) => ({ ...edge, laneCount: laneCounts.get(edge.to) ?? 1 }))

  let maxRows = 0
  for (const layer of layers) maxRows = Math.max(maxRows, layer?.length ?? 0)
  return {
    positioned: placed,
    byId,
    edges,
    layers: layers.filter((layer): layer is PositionedNode[] => layer !== undefined),
    layerCount: layers.length,
    maxRows,
    longEdgeCount: edges.filter((edge) => edge.long).length,
    critical: new Set(input.criticalPath),
    bottlenecks: new Map(input.bottlenecks.map((bottleneck) => [bottleneck.nodeId, bottleneck.blockedCount])),
  }
}
