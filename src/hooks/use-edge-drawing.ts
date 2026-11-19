import { useCallback, useSyncExternalStore } from "react"
import { ReactFlowState, useStoreApi } from "@xyflow/react"
import {
  edgeDrawings,
  outputKey,
  type DrawAs,
  type EdgeDrawing,
  type EdgeDrawings,
} from "@/src/lib/graph/edge-drawing"

/**
 * The graph's edge drawings (see edge-drawing.ts), shared by every edge and
 * waypoint. React Flow's store changes on every pan frame and calls every
 * subscriber's selector then; the drawings change only with the edges or the
 * nodes (a node carries its outputs' `drawAs`). So one subscription per graph
 * recomputes them when those change and tells the edges and waypoints only
 * when the result differs: panning runs one reference comparison, not a
 * selector per edge.
 */

interface Drawings extends EdgeDrawings {
  /** Per waypoint: "<edges>|<lines>" through it (references and displays are not drawn). */
  waypoints: ReadonlyMap<string, string>
}

type FlowStore = ReturnType<typeof useStoreApi>

export function drawAsOf(state: ReactFlowState) {
  return (source: string, sourceHandle: string | null | undefined): DrawAs | undefined =>
    (state.nodeLookup.get(source)?.data as { drawAs?: Record<string, DrawAs> } | undefined)?.drawAs?.[
      sourceHandle ?? ""
    ]
}

/** The drawings and a signature of them (equal signatures: nothing to tell). */
function compute(state: ReactFlowState): [Drawings, string] {
  const base = edgeDrawings(state.edges, drawAsOf(state))
  const use = new Map<string, [number, number]>()
  let signature = ""
  for (const edge of state.edges) {
    const drawing = base.of.get(edge.id) ?? "line"
    signature += `${edge.id}:${drawing};`
    const ids = (edge.data as Record<string, unknown> | undefined)?.waypointIds as string[] | undefined
    if (!ids) continue
    const line = drawing === "line" ? 1 : 0
    for (const id of ids) {
      const counts = use.get(id) ?? [0, 0]
      use.set(id, [counts[0] + 1, counts[1] + line])
    }
  }
  base.outputs.forEach((marks, key) => (signature += `${key}:${marks.references}|${marks.displays}|${marks.markEdge};`))
  const waypoints = new Map<string, string>()
  use.forEach(([all, lines], id) => waypoints.set(id, `${all}|${lines}`))
  return [{ ...base, waypoints }, signature]
}

class DrawingsStore {
  drawings: Drawings
  private signature: string
  private edges: unknown
  private nodes: unknown
  private readonly listeners = new Set<() => void>()

  constructor(flow: FlowStore) {
    const state = flow.getState()
    this.edges = state.edges
    this.nodes = state.nodes
    ;[this.drawings, this.signature] = compute(state)
    flow.subscribe(next => this.update(next))
  }

  private update(state: ReactFlowState): void {
    if (state.edges === this.edges && state.nodes === this.nodes) return // a pan frame
    this.edges = state.edges
    this.nodes = state.nodes
    const [drawings, signature] = compute(state)
    if (signature === this.signature) return // e.g. a node dragged
    this.drawings = drawings
    this.signature = signature
    this.listeners.forEach(listener => listener())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

const stores = new WeakMap<FlowStore, DrawingsStore>()

function useDrawingsStore(): DrawingsStore {
  const flow = useStoreApi()
  let store = stores.get(flow)
  if (!store) stores.set(flow, (store = new DrawingsStore(flow)))
  return store
}

export function useEdgeDrawing(edgeId: string): EdgeDrawing {
  const store = useDrawingsStore()
  const snapshot = useCallback(() => store.drawings.of.get(edgeId) ?? "line", [store, edgeId])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

/**
 * The marks this edge draws at its source output: "<references>|<displays>",
 * or "" when another edge of the same output draws them (one set per output).
 */
export function useOutputMarks(edgeId: string, source: string, sourceHandle: string | null | undefined): string {
  const store = useDrawingsStore()
  const snapshot = useCallback(() => {
    const marks = store.drawings.outputs.get(outputKey(source, sourceHandle))
    return marks && marks.markEdge === edgeId ? `${marks.references}|${marks.displays}` : ""
  }, [store, edgeId, source, sourceHandle])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

/** "<edges>|<lines>" through a waypoint. */
export function useWaypointUse(waypointId: string): string {
  const store = useDrawingsStore()
  const snapshot = useCallback(() => store.drawings.waypoints.get(waypointId) ?? "0|0", [store, waypointId])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}
