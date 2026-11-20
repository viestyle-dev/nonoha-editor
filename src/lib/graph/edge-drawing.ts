/**
 * How each edge is drawn, decided by the system from the graph's structure
 * (never from positions, so moving a node never changes it):
 *
 * - "display": into a display node from the engine side. A display watches a
 *   value; it is not part of the data flow, so it gets its own marks (the
 *   source's eye count and a name tag at the display), never a line.
 * - Data edges are drawn alike for every consumer of one output (an output
 *   never mixes lines and references, which would read as "it goes only
 *   there"). An output's edges are references when
 *   - all its consumers are settings (`@` properties), or
 *   - its consumers span BROADCAST_LAYERS or more layers of the flow (a
 *     value used at several stages, like a clock),
 *   and lines otherwise. A reference shows a tag at each end and its line
 *   only while its nodes are selected: a connection that crosses the flow
 *   is not drawn across it.
 * - The source node's `drawAs` (per output) overrides the rule for its data
 *   edges: an escape hatch, not a choice users are expected to make.
 * - An edge the engine refused (`data.valid === false`) is a line whatever
 *   its output's edges are: it has to be seen to be fixed.
 *
 * Layers: the longest path from the graph's sources over data edges.
 */

export type EdgeDrawing = "line" | "reference" | "display"
export type DrawAs = "line" | "reference"

export interface DrawnEdge {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
  data?: { valid?: unknown }
}

export interface EdgeDrawings {
  of: ReadonlyMap<string, EdgeDrawing>
  /** Per output (outputKey): how its edges are drawn besides lines. */
  outputs: ReadonlyMap<string, OutputMarks>
}

export interface OutputMarks {
  references: number
  displays: number
  /** The edge that draws the output's marks (one per output). */
  markEdge: string
}

const BROADCAST_LAYERS = 3

export function outputKey(source: string, sourceHandle: string | null | undefined): string {
  return `${source}\u0000${sourceHandle ?? ""}`
}

const isEditorNode = (id: string) => id.startsWith("$editor:")

export function isDisplayEdge(edge: DrawnEdge): boolean {
  return isEditorNode(edge.target) && !isEditorNode(edge.source)
}

/** Longest path from the sources over the given edges; nodes on a cycle get the layer their known inputs give. */
function layersOf(edges: readonly DrawnEdge[]): Map<string, number> {
  const inputs = new Map<string, string[]>()
  const outputs = new Map<string, string[]>()
  const nodes = new Set<string>()
  for (const e of edges) {
    nodes.add(e.source)
    nodes.add(e.target)
    let o = outputs.get(e.source)
    if (!o) outputs.set(e.source, (o = []))
    o.push(e.target)
    let i = inputs.get(e.target)
    if (!i) inputs.set(e.target, (i = []))
    i.push(e.source)
  }
  const pending = new Map<string, number>()
  const layer = new Map<string, number>()
  const ready: string[] = []
  nodes.forEach(n => {
    const count = inputs.get(n)?.length ?? 0
    pending.set(n, count)
    if (count === 0) {
      layer.set(n, 0)
      ready.push(n)
    }
  })
  while (ready.length) {
    const n = ready.pop()!
    const next = layer.get(n)! + 1
    for (const t of outputs.get(n) ?? []) {
      if ((layer.get(t) ?? -1) < next) layer.set(t, next)
      const left = pending.get(t)! - 1
      pending.set(t, left)
      if (left === 0) ready.push(t)
    }
  }
  return layer
}

export function edgeDrawings(
  edges: readonly DrawnEdge[],
  drawAsOf: (source: string, sourceHandle: string | null | undefined) => DrawAs | undefined,
): EdgeDrawings {
  const data = edges.filter(e => !isDisplayEdge(e))
  const layer = layersOf(data)
  const byOutput = new Map<string, DrawnEdge[]>()
  for (const e of data) {
    const key = outputKey(e.source, e.sourceHandle)
    let list = byOutput.get(key)
    if (!list) byOutput.set(key, (list = []))
    list.push(e)
  }

  const of = new Map<string, EdgeDrawing>()
  const outputs = new Map<string, OutputMarks>()
  const mark = (key: string, edge: DrawnEdge, kind: "references" | "displays") => {
    let marks = outputs.get(key)
    if (!marks) outputs.set(key, (marks = { references: 0, displays: 0, markEdge: edge.id }))
    marks[kind]++
  }

  byOutput.forEach((list, key) => {
    const first = list[0]
    let drawAs = drawAsOf(first.source, first.sourceHandle)
    if (drawAs === undefined) {
      const settings = list.every(e => (e.targetHandle ?? "").startsWith("@"))
      const layers = new Set(list.map(e => layer.get(e.target)))
      drawAs = settings || layers.size >= BROADCAST_LAYERS ? "reference" : "line"
    }
    for (const e of list) {
      const drawing = e.data?.valid === false ? "line" : drawAs
      of.set(e.id, drawing)
      if (drawing === "reference") mark(key, e, "references")
    }
  })
  for (const e of edges) {
    if (!isDisplayEdge(e)) continue
    of.set(e.id, "display")
    mark(outputKey(e.source, e.sourceHandle), e, "displays")
  }
  return { of, outputs }
}
